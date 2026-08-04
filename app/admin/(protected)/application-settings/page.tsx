import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { database, safeJson } from "@/lib/platform";
import { currentRecruitmentReadiness } from "@/lib/recruitment-runtime";

export const dynamic = "force-dynamic";

type SettingsRow = {
  open: number;
  introduction: string;
  closed_message: string;
  notification_recipients: string;
  privacy_policy_version: string;
  retention_days: number | null;
};

export default async function ApplicationSettingsPage() {
  const settings = await database().prepare(
    "SELECT open, introduction, closed_message, notification_recipients, privacy_policy_version, retention_days FROM application_settings WHERE id = 1",
  ).first<SettingsRow>();
  const recipients = safeJson<string[]>(settings?.notification_recipients, []);
  const configuredOpen = Boolean(settings?.open);
  const readiness = currentRecruitmentReadiness({
    retentionDays: settings?.retention_days ?? null,
    privacyPolicyVersion: settings?.privacy_policy_version ?? "",
    notificationRecipients: recipients,
  });
  const open = configuredOpen && readiness.ready;

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Application settings"
        description="Control the single application cycle, public messaging and notification recipients. Closing the form is enforced again when a visitor submits."
        actions={<StatusBadge value={open ? "Open" : configuredOpen ? "Blocked" : "Closed"} />}
      />
      {!readiness.ready ? (
        <div className={styles.noticeWarning}>
          <strong>Application intake is locked.</strong> {readiness.messages.join(" ")}
        </div>
      ) : null}
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Form configuration</h2><span className={styles.panelMeta}>One form · three fixed divisions</span></div>
        <div className={styles.panelBody}>
          <ActionForm action="/api/admin/application-settings" method="PATCH" submitLabel="Save application settings" confirmation={configuredOpen ? undefined : "Save these settings? Select “Applications open” below if you intend to reopen the public form."}>
            <input type="hidden" name="openPresent" value="true" />
            <div className={styles.formGrid}>
              <div className={styles.fieldWide}><label className={styles.checkboxRow}><input type="checkbox" name="open" value="true" defaultChecked={configuredOpen} /> Applications open</label><span className={styles.hint}>The public form opens only when the separately approved privacy policy, retention period, email provider and malware scanner all match these settings.</span></div>
              <div className={styles.fieldWide}><label className={styles.label} htmlFor="introduction">Open-state introduction</label><textarea className={styles.textarea} id="introduction" name="introduction" defaultValue={settings?.introduction ?? ""} maxLength={4000} required /></div>
              <div className={styles.fieldWide}><label className={styles.label} htmlFor="closedMessage">Closed-state message</label><textarea className={styles.textarea} id="closedMessage" name="closedMessage" defaultValue={settings?.closed_message ?? ""} maxLength={2000} required /></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="notificationRecipients">Admin notification recipients</label><textarea className={styles.textarea} id="notificationRecipients" name="notificationRecipients" defaultValue={recipients.join("\n")} placeholder="one@email.org per line" /><span className={styles.hint}>New-application notices are queued without attaching the CV.</span></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="privacyPolicyVersion">Privacy policy version</label><input className={styles.input} id="privacyPolicyVersion" name="privacyPolicyVersion" defaultValue={settings?.privacy_policy_version ?? "2026-08-04"} maxLength={60} required /><span className={styles.hint}>Stored with each applicant’s acknowledgement.</span></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="retentionDays">Applicant retention (days)</label><input className={styles.input} id="retentionDays" name="retentionDays" type="number" min="1" max="3650" step="1" defaultValue={settings?.retention_days ?? ""} /><span className={styles.hint}>Must match the organisation-approved retention period before intake can open. Each application receives a fixed deletion date.</span></div>
            </div>
          </ActionForm>
        </div>
      </section>

      <div className={styles.splitEditor}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Open-state preview</h2><StatusBadge value="Open" /></div>
          <div className={styles.panelBody}><div className={styles.previewBox}><h2>Apply to M&amp;A Watch</h2><p>{settings?.introduction}</p><p><strong>Form fields:</strong> name, university, email, Law / Finance / Markets, PDF CV and privacy acknowledgement.</p></div></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Closed-state preview</h2><StatusBadge value="Closed" /></div>
          <div className={styles.panelBody}><div className={styles.previewBox}><h2>Applications are closed</h2><p>{settings?.closed_message}</p></div></div>
        </section>
      </div>
    </>
  );
}
