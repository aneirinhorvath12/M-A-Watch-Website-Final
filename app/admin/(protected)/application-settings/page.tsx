import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { database, safeJson } from "@/lib/platform";

export const dynamic = "force-dynamic";

type SettingsRow = {
  open: number;
  introduction: string;
  closed_message: string;
  notification_recipients: string;
  privacy_policy_version: string;
};

export default async function ApplicationSettingsPage() {
  const settings = await database().prepare(
    "SELECT open, introduction, closed_message, notification_recipients, privacy_policy_version FROM application_settings WHERE id = 1",
  ).first<SettingsRow>();
  const recipients = safeJson<string[]>(settings?.notification_recipients, []);
  const open = Boolean(settings?.open);

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Application settings"
        description="Control the single application cycle, public messaging and notification recipients. Closing the form is enforced again when a visitor submits."
        actions={<StatusBadge value={open ? "Open" : "Closed"} />}
      />
      <div className={styles.noticeWarning}>
        Confirmation and administrator emails are saved to a durable delivery queue. A transactional email provider still needs to be connected before queued messages can be sent.
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Form configuration</h2><span className={styles.panelMeta}>One form · three fixed divisions</span></div>
        <div className={styles.panelBody}>
          <ActionForm action="/api/admin/application-settings" method="PATCH" submitLabel="Save application settings" confirmation={open ? undefined : "Save these settings? Select “Applications open” below if you intend to reopen the public form."}>
            <input type="hidden" name="openPresent" value="true" />
            <div className={styles.formGrid}>
              <div className={styles.fieldWide}><label className={styles.checkboxRow}><input type="checkbox" name="open" value="true" defaultChecked={open} /> Applications open</label><span className={styles.hint}>If cleared, the public form is removed and new submissions are rejected server-side.</span></div>
              <div className={styles.fieldWide}><label className={styles.label} htmlFor="introduction">Open-state introduction</label><textarea className={styles.textarea} id="introduction" name="introduction" defaultValue={settings?.introduction ?? ""} maxLength={4000} required /></div>
              <div className={styles.fieldWide}><label className={styles.label} htmlFor="closedMessage">Closed-state message</label><textarea className={styles.textarea} id="closedMessage" name="closedMessage" defaultValue={settings?.closed_message ?? ""} maxLength={2000} required /></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="notificationRecipients">Admin notification recipients</label><textarea className={styles.textarea} id="notificationRecipients" name="notificationRecipients" defaultValue={recipients.join("\n")} placeholder="one@email.org per line" /><span className={styles.hint}>New-application notices are queued without attaching the CV.</span></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="privacyPolicyVersion">Privacy policy version</label><input className={styles.input} id="privacyPolicyVersion" name="privacyPolicyVersion" defaultValue={settings?.privacy_policy_version ?? "2026-08-04"} maxLength={60} required /><span className={styles.hint}>Stored with each applicant’s acknowledgement.</span></div>
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
