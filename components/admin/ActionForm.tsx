"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useId, useState, type FormEvent, type ReactNode } from "react";
import { usePublicationEditSession } from "./PublicationEditSession";
import styles from "./admin.module.css";

const SavedBodyContext = createContext<string | undefined>(undefined);
export const useSavedArticleBody = () => useContext(SavedBodyContext);

type ActionFormProps = {
  action: string;
  method?: "POST" | "PATCH" | "DELETE";
  mode?: "json" | "form-data";
  submitLabel: string;
  pendingLabel?: string;
  confirmation?: string;
  redirectTo?: string;
  className?: string;
  buttonTone?: "primary" | "secondary" | "danger" | "quiet";
  children?: ReactNode;
  onSuccessMessage?: string;
};

function buttonClass(tone: ActionFormProps["buttonTone"]): string {
  if (tone === "secondary") return styles.buttonSecondary;
  if (tone === "danger") return styles.buttonDanger;
  if (tone === "quiet") return styles.buttonQuiet;
  return styles.button;
}

export function ActionForm({
  action,
  method = "POST",
  mode = "json",
  submitLabel,
  pendingLabel = "Saving…",
  confirmation,
  redirectTo,
  className,
  buttonTone = "primary",
  children,
  onSuccessMessage = "Saved.",
}: ActionFormProps) {
  const router = useRouter();
  const session = usePublicationEditSession();
  const [savedBody, setSavedBody] = useState<{ value: string; resetKey: number }>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const statusId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || session?.busy) return;
    if (confirmation && !window.confirm(confirmation)) return;
    const formData = new FormData(event.currentTarget);
    if (session?.articleDirty && formData.get("intent") !== "save" && !action.endsWith("/cover")) {
      setError("Save your article changes before changing its workflow or applying a revision.");
      return;
    }
    if (session && !session.begin()) return;
    if (session) formData.set("expectedVersion", String(session.version));
    setPending(true);
    setMessage("");
    setError("");

    const init: RequestInit = { method, headers: { Accept: "application/json" } };
    if (mode === "form-data") {
      init.body = formData;
    } else {
      const payload: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
      for (const [key, value] of formData.entries()) {
        const current = payload[key];
        payload[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
      }
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(payload);
    }

    try {
      const response = await fetch(action, init);
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
        message?: string;
        version?: number;
        resetBody?: string;
        webBody?: string;
      };
      if (!response.ok) throw new Error(result.error || "The change could not be saved.");
      const submittedBody = formData.get("webBody");
      if (typeof submittedBody === "string") setSavedBody({ value: result.webBody ?? submittedBody, resetKey: session?.bodyReset?.key ?? 0 });
      session?.finish(result);
      setMessage(result.message || onSuccessMessage);
      const target = result.redirect || redirectTo;
      if (target) router.push(target);
      router.refresh();
    } catch (cause) {
      session?.finish();
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form aria-busy={pending} aria-describedby={statusId} className={className} onSubmit={submit}>
      <SavedBodyContext.Provider value={savedBody?.resetKey === (session?.bodyReset?.key ?? 0) ? savedBody.value : undefined}>
        <fieldset disabled={pending || session?.busy} className={styles.actionFields}>{children}</fieldset>
      </SavedBodyContext.Provider>
      <button type="submit" className={buttonClass(buttonTone)} disabled={pending || session?.busy}>
        {pending ? pendingLabel : submitLabel}
      </button>
      <div
        className={`${styles.formStatus} ${error ? styles.formStatusError : ""}`}
        id={statusId}
        role="status"
        aria-atomic="true"
        aria-live="polite"
      >
        {error || message || (pending ? pendingLabel : "")}
      </div>
    </form>
  );
}
