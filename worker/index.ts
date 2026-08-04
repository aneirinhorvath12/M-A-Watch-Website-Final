/** Cloudflare Worker entry point for M&A Watch. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  notifyMaintenanceCompleted,
  notifyMaintenanceFailed,
  type MaintenanceMonitoringEnv,
} from "@/lib/maintenance-monitoring";
import { resolvePublicationContentMode } from "@/lib/publications/content-mode";
import { applyResponseSecurity } from "@/lib/response-security";
import type { JobRunSummary } from "@/lib/job-runner";

interface Env extends MaintenanceMonitoringEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  PUBLICATION_CONTENT_MODE?: string;
  ANALYTICS_ENABLED?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Representative fixture PDFs are useful for explicit demo deployments,
    // but managed editorial mode must not expose them merely because the
    // catalogue stopped linking to their static paths.
    if (
      url.pathname.startsWith("/sample-reports/") &&
      resolvePublicationContentMode(env.PUBLICATION_CONTENT_MODE) !== "demo"
    ) {
      return applyResponseSecurity(
        new Response("Not found", {
          status: 404,
          headers: {
            "cache-control": "private, no-store",
            "content-type": "text/plain; charset=utf-8",
          },
        }),
        url,
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => {
          const sourceUrl = new URL(path, request.url);
          if (sourceUrl.origin === url.origin && isManagedImageSourcePath(sourceUrl.pathname)) {
            // Optimized managed images are deliberately fetched without the
            // visitor's identity. Only source routes which independently
            // prove the asset is currently public can enter the shared cache.
            return handler.fetch(new Request(sourceUrl, {
              headers: { Accept: "image/avif,image/webp,image/*" },
            }), env, ctx);
          }
          return env.ASSETS.fetch(new Request(sourceUrl));
        },
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      const headers = new Headers(response.headers);
      // Vinext defaults transformed images to immutable one-year caching.
      // Managed editorial images are revocable through publish/archive
      // controls, so every optimized response must revalidate promptly.
      if (response.ok && isManagedOptimizerRequest(url)) {
        headers.set("Cache-Control", "public, max-age=300, s-maxage=300, must-revalidate");
      }
      return applyResponseSecurity(new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }), url);
    }

    const response = await handler.fetch(request, env, ctx);
    return applyResponseSecurity(response, url);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
  ): Promise<void> {
    const startedAt = Date.now();
    let summary: JobRunSummary;
    try {
      const { runMaintenance } = await import("@/lib/job-runner");
      summary = await runMaintenance();
    } catch (error) {
      console.error("Scheduled maintenance failed", {
        errorType: safeErrorType(error),
      });
      try {
        await notifyMaintenanceFailed(env, {
          startedAt,
          finishedAt: Date.now(),
        });
      } catch (notificationError) {
        console.error("Maintenance failure notification could not be delivered", {
          errorType: safeErrorType(notificationError),
        });
      }
      // Keep the scheduled invocation failed in platform observability instead
      // of converting an operational failure into a successful Cron event.
      throw error;
    }

    console.info("Scheduled maintenance completed", summary);
    try {
      await notifyMaintenanceCompleted(env, summary, {
        startedAt,
        finishedAt: Date.now(),
      });
    } catch (error) {
      console.error("Maintenance heartbeat or alert could not be delivered", {
        errorType: safeErrorType(error),
      });
      throw error;
    }
  },
};

function isManagedImageSourcePath(pathname: string): boolean {
  return (
    /^\/api\/publications\/[^/]+\/(?:images|cover)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(pathname) ||
    /^\/api\/content\/info\/assets\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(pathname) ||
    /^\/api\/team\/images\/team_[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/i.test(pathname)
  );
}

function isManagedOptimizerRequest(url: URL): boolean {
  const source = url.searchParams.get("url");
  if (!source) return false;
  try {
    return isManagedImageSourcePath(new URL(source, url).pathname);
  } catch {
    return false;
  }
}

function safeErrorType(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

export default worker;
