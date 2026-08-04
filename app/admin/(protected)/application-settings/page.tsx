import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import {
  APPLICANT_RETENTION_DAYS,
  CURRENT_APPLICATION_PRIVACY_VERSION,
} from "@/lib/data-policy";
import { database, safeJson } from "@/lib/platform";
import {
  currentRecruitmentOperationsStatus,
  currentRecruitmentIntakeReadiness,
} from "@/lib/recruitment-runtime";

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
  const readiness = await currentRecruitmentIntakeReadiness({
    retentionDays: settings?.retention_days ?? null,
    privacyPolicyVersion: settings?.privacy_policy_version ?? "",
    notificationRecipients: recipients,
  });
  const operations = currentRecruitmentOperationsStatus();
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
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="privacyPolicyVersion">Privacy policy version</label><input className={styles.input} id="privacyPolicyVersion" name="privacyPolicyVersion" defaultValue={CURRENT_APPLICATION_PRIVACY_VERSION} maxLength={60} required /><span className={styles.hint}>Current published version: {CURRENT_APPLICATION_PRIVACY_VERSION}. Stored value: {settings?.privacy_policy_version || "none"}. Saving updates the acknowledgement used for future applications.</span></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="retentionDays">Applicant retention (days)</label><input className={styles.input} id="retentionDays" name="retentionDays" type="number" min={APPLICANT_RETENTION_DAYS} max={APPLICANT_RETENTION_DAYS} step="1" defaultValue={settings?.retention_days ?? APPLICANT_RETENTION_DAYS} /><span className={styles.hint}>The published policy is {APPLICANT_RETENTION_DAYS} days. Each application receives a fixed automatic deletion date.</span></div>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Operational readiness</h2><span className={styles.panelMeta}>Secret values are never shown here</span></div>
        <div className={styles.panelBody}>
          <dl className={styles.detailList}>
            <div className={styles.detailItem}><dt>Transactional email</dt><dd><StatusBadge value={operations.emailProvider ? "Credentials detected" : "Required"} /> {operations.emailProvider ? `${operations.emailProvider} credentials are present but still require a successful delivery test.` : "Add RESEND_API_KEY and EMAIL_FROM using a verified sender domain, or configure the secure custom webhook pair."}</dd></div>
            <div className={styles.detailItem}><dt>Malware scanning</dt><dd><StatusBadge value={operations.malwareProvider ? "Credentials detected" : "Required"} /> {operations.malwareProvider ? `${operations.malwareProvider} credentials are present but clean, rejected and timeout paths still require testing.` : "Add CLOUDMERSIVE_API_KEY as a hosted secret, or configure the secure custom scanner webhook pair. Files remain quarantined until an explicit clean result."}</dd></div>
            <div className={styles.detailItem}><dt>Automatic retention</dt><dd><StatusBadge value={operations.maintenanceSchedulerApproved ? "Approval recorded" : "Required"} /> {operations.maintenanceSchedulerApproved ? "Scheduler provisioning has been recorded; confirm its latest heartbeat before relying on it." : "Configure the recurring maintenance workflow and monitoring, run it successfully, then set MAINTENANCE_SCHEDULER_ENABLED=true. Expiry dates alone do not delete records."}</dd></div>
          </dl>
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
