"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./admin.module.css";

const ACTIVE_STATUSES = new Set(["uploaded", "parsing"]);

export function PublicationJobStatus({
  publicationId,
  initialStatus,
}: {
  publicationId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState(
    initialStatus === "uploaded"
      ? "The source is queued for security scanning. You can leave this page."
      : initialStatus === "parsing"
        ? "PDF extraction is running. You can leave this page."
        : "",
  );

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(initialStatus)) return;
    let stopped = false;
    const controller = new AbortController();

    async function checkStatus() {
      if (stopped) return;
      try {
        const response = await fetch(
          `/api/admin/publications/${encodeURIComponent(publicationId)}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (!response.ok || stopped) return;
        const result = (await response.json()) as {
          publication?: { status?: string };
        };
        const status = result.publication?.status;
        if (!status || status === initialStatus) return;
        stopped = true;
        setAnnouncement(
          status === "parse_failed"
            ? "PDF processing finished with an error. The page has been updated with recovery options."
            : status === "draft"
              ? "PDF processing is complete. The editable draft is ready."
              : `Publication processing moved to ${status.replaceAll("_", " ")}.`,
        );
        router.refresh();
      } catch {
        // A later poll or manual refresh can recover; status polling must not
        // interfere with the editor itself.
      }
    }

    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), 5_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      controller.abort();
    };
  }, [initialStatus, publicationId, router]);

  if (!announcement) return null;
  return (
    <p
      aria-atomic="true"
      aria-live="polite"
      className={styles.notice}
      role="status"
    >
      {announcement}
    </p>
  );
}
