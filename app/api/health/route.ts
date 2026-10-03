import { verifyDatabaseSchema } from "@/db/bootstrap";
import { env } from "cloudflare:workers";
import {
  missingProductionServiceConfiguration,
  productionServicesAreRequired,
  type ProductionReadinessEnv,
} from "@/lib/runtime-readiness";

export const dynamic = "force-dynamic";

type ReadinessEnv = {
  DB?: D1Database;
  FILES?: R2Bucket;
} & ProductionReadinessEnv;

const noStoreHeaders = { "cache-control": "no-store, max-age=0" };

async function readinessResponse(includeBody = true): Promise<Response> {
  const bindings = env as unknown as ReadinessEnv;
  try {
    if (!bindings.DB || !bindings.FILES) throw new Error("Missing runtime binding");
    if (productionServicesAreRequired(bindings)) {
      const missing = missingProductionServiceConfiguration(bindings);
      if (missing.length) {
        console.error(
          `Production service configuration is incomplete: ${missing.join(", ")}`,
        );
        throw new Error("Production service configuration is incomplete");
      }
    }
    await verifyDatabaseSchema(bindings.DB);

    // A missing sentinel is expected. The HEAD still verifies that the private
    // bucket binding is reachable without writing an object on every probe.
    await bindings.FILES.head(".ma-watch-readiness-sentinel");
    return includeBody
      ? Response.json(
          {
            status: "ready",
            checks: {
              database: "ok",
              privateStorage: "ok",
              productionServices: productionServicesAreRequired(bindings)
                ? "ok"
                : "not-enforced",
            },
          },
          { status: 200, headers: noStoreHeaders },
        )
      : new Response(null, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    console.error("Readiness check failed", error);
    return includeBody
      ? Response.json(
          { status: "unavailable" },
          { status: 503, headers: noStoreHeaders },
        )
      : new Response(null, { status: 503, headers: noStoreHeaders });
  }
}

export async function GET() {
  return readinessResponse(true);
}

export async function HEAD() {
  return readinessResponse(false);
}
