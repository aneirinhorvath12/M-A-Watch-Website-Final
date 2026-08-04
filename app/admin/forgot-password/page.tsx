import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import styles from "@/components/admin/admin.module.css";

export const metadata: Metadata = {
  title: "Recover admin access",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className={`${styles.adminRoot} ${styles.loginRoot}`}>
      <section className={styles.loginCard} aria-labelledby="recovery-title">
        <div className={styles.brandMark} aria-hidden="true">M&amp;A</div>
        <p className={styles.eyebrow}>Account access</p>
        <h1 id="recovery-title">Recover your sign-in</h1>
        <p>
          M&amp;A Watch does not store administrative passwords. Account recovery and multi-factor authentication are handled by the secure identity provider on the sign-in screen.
        </p>
        <p>
          Choose <strong>Continue securely</strong>, enter your invited email address and use the recovery option shown there. This page deliberately does not confirm whether an address has an administrative account.
        </p>
        <a className={styles.button} href={chatGPTSignInPath("/admin")}>Continue securely</a>
        <div className={styles.loginLinks}>
          <Link href="/admin/login">Back to admin sign in</Link>
          <Link href="/">Return to website</Link>
        </div>
      </section>
    </main>
  );
}
