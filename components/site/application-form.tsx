"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { trackAnalytics } from "./analytics-tracker";

type FieldName = "name" | "university" | "email" | "division" | "cv" | "privacyConsent";
type FieldErrors = Partial<Record<FieldName, string>>;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function ApplicationForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [session, setSession] = useState({ submissionKey: "", formStartedAt: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession({
        submissionKey: crypto.randomUUID(),
        formStartedAt: String(Date.now()),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const validate = (form: FormData): FieldErrors => {
    const next: FieldErrors = {};
    const value = (field: FieldName) => String(form.get(field) ?? "").trim();
    const email = value("email");
    const cv = form.get("cv");

    if (value("name").length < 2) next.name = "Enter your full name.";
    if (value("university").length < 2) next.university = "Enter your university.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email address.";
    if (!["law", "finance", "markets"].includes(value("division"))) {
      next.division = "Select Law, Finance or Markets.";
    }
    if (!(cv instanceof File) || cv.size === 0) {
      next.cv = "Attach your CV as a PDF.";
    } else if (cv.size > MAX_FILE_BYTES) {
      next.cv = "Your CV must be 10 MB or smaller.";
    } else if (cv.type !== "application/pdf" && !cv.name.toLowerCase().endsWith(".pdf")) {
      next.cv = "Upload a PDF file.";
    }
    if (!form.get("privacyConsent")) {
      next.privacyConsent = "You must acknowledge the privacy notice.";
    }
    return next;
  };

  const focusFirstError = (nextErrors: FieldErrors) => {
    const first = Object.keys(nextErrors)[0];
    if (!first) return;
    window.requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${first}"]`)
        ?.focus();
    });
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    if (!form.get("submissionKey")) {
      form.set("submissionKey", session.submissionKey || crypto.randomUUID());
    }
    if (!form.get("formStartedAt")) {
      form.set("formStartedAt", session.formStartedAt || String(Date.now() - 2_000));
    }
    const clientErrors = validate(form);
    setErrors(clientErrors);
    setMessage("");
    if (Object.keys(clientErrors).length) {
      trackAnalytics({
        event: "application_validation_failure",
        value: clientErrors.cv ? "upload_validation" : "client_validation",
      });
      setMessage("Please check the highlighted fields.");
      focusFirstError(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        fields?: FieldErrors;
      };

      if (!response.ok || !result.ok) {
        const serverErrors = result.fields ?? {};
        trackAnalytics({
          event: "application_validation_failure",
          value:
            response.status === 409 || response.status === 503
              ? "policy_unavailable"
              : serverErrors.cv
                ? "upload_validation"
                : "server_validation",
        });
        setErrors(serverErrors);
        setMessage(result.error ?? "We could not submit your application. Please try again.");
        focusFirstError(serverErrors);
        return;
      }

      trackAnalytics({ event: "application_submit_success" });
      router.replace("/apply/confirmation");
    } catch {
      trackAnalytics({
        event: "application_validation_failure",
        value: "network",
      });
      setMessage("We could not connect to the application service. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  const errorProps = (field: FieldName) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${field}-error` : undefined,
  });

  return (
    <form ref={formRef} className="application-form" onSubmit={handleSubmit} noValidate encType="multipart/form-data">
      <input type="hidden" name="submissionKey" value={session.submissionKey} />
      <input type="hidden" name="formStartedAt" value={session.formStartedAt} />
      <div className="form-honeypot" aria-hidden="true">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="form-section-heading">
        <span>01</span>
        <div>
          <h2>About you</h2>
          <p>All fields are required.</p>
        </div>
      </div>

      <div className="form-grid form-grid--two">
        <div className="form-field">
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" type="text" autoComplete="name" required {...errorProps("name")} />
          {errors.name ? <p className="form-error" id="name-error">{errors.name}</p> : null}
        </div>
        <div className="form-field">
          <label htmlFor="university">University</label>
          <input id="university" name="university" type="text" autoComplete="organization" required {...errorProps("university")} />
          {errors.university ? <p className="form-error" id="university-error">{errors.university}</p> : null}
        </div>
        <div className="form-field form-field--wide">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required {...errorProps("email")} />
          {errors.email ? <p className="form-error" id="email-error">{errors.email}</p> : null}
        </div>
      </div>

      <div className="form-section-heading">
        <span>02</span>
        <div>
          <h2>Your application</h2>
          <p>Choose the division that best reflects your interests.</p>
        </div>
      </div>

      <fieldset className="form-field division-field" {...errorProps("division")}>
        <legend>Division</legend>
        <div className="division-options">
          {["Law", "Finance", "Markets"].map((division) => (
            <label key={division}>
              <input type="radio" name="division" value={division.toLowerCase()} required />
              <span>{division}</span>
            </label>
          ))}
        </div>
        {errors.division ? <p className="form-error" id="division-error">{errors.division}</p> : null}
      </fieldset>

      <div className="form-field file-field">
        <label htmlFor="cv">CV</label>
        <p id="cv-help">PDF only, up to 10 MB. Your file is stored privately.</p>
        <input id="cv" name="cv" type="file" accept="application/pdf,.pdf" required aria-describedby={errors.cv ? "cv-help cv-error" : "cv-help"} aria-invalid={errors.cv ? true : undefined} />
        {errors.cv ? <p className="form-error" id="cv-error">{errors.cv}</p> : null}
      </div>

      <div className="consent-field">
        <input id="privacyConsent" name="privacyConsent" type="checkbox" required {...errorProps("privacyConsent")} />
        <label htmlFor="privacyConsent">
          I have read the <Link href="/privacy" target="_blank">privacy notice</Link> and consent to M&amp;A Watch processing my data for recruitment.
        </label>
      </div>
      {errors.privacyConsent ? <p className="form-error consent-error" id="privacyConsent-error">{errors.privacyConsent}</p> : null}

      <div className="form-submit-row">
        <p className="form-status" role="status" aria-live="polite">{message}</p>
        <button className="button button--primary" type="submit" disabled={submitting || !session.submissionKey}>
          {submitting ? "Submitting…" : "Submit application"}
          {!submitting ? <span aria-hidden="true">→</span> : null}
        </button>
      </div>
    </form>
  );
}
