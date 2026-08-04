"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import styles from "./admin.module.css";

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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (confirmation && !window.confirm(confirmation)) return;
    setPending(true);
    setMessage("");
    setError("");

    const formData = new FormData(event.currentTarget);
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
      };
      if (!response.ok) throw new Error(result.error || "The change could not be saved.");
      setMessage(result.message || onSuccessMessage);
      const target = result.redirect || redirectTo;
      if (target) router.push(target);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={className} onSubmit={submit}>
      {children}
      <button type="submit" className={buttonClass(buttonTone)} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
      <div
        className={`${styles.formStatus} ${error ? styles.formStatusError : ""}`}
        role="status"
        aria-live="polite"
      >
        {error || message}
      </div>
    </form>
  );
}
