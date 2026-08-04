import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getAdminActor } from "@/lib/admin-auth";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in | M&A Watch",
  robots: { index: false, follow: false },
};

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin";
  return value.slice(0, 300);
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to);
  const actor = await getAdminActor();
  if (actor) redirect(returnTo);
  const identity = await getChatGPTUser();

  return (
    <main className={`${styles.adminRoot} ${styles.loginRoot}`}>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <div className={styles.brandMark} aria-hidden="true">M&amp;A</div>
        <p className={styles.eyebrow}>Private workspace</p>
        <h1 id="login-title">Administration sign in</h1>
        <p>
          Access is invitation-only. Sign in with the email address that received your M&amp;A Watch invitation.
        </p>
        {identity ? (
          <div className={styles.noticeWarning} role="alert">
            <strong>{identity.email}</strong> is signed in, but it does not have an active invitation. The invitation may be pending, expired or disabled.
          </div>
        ) : null}
        <a className={styles.button} href={chatGPTSignInPath(returnTo)}>
          Continue securely
        </a>
        <div className={styles.loginLinks}>
          <Link href="/admin/forgot-password">Trouble signing in?</Link>
          {identity ? <a href={chatGPTSignOutPath("/admin/login")}>Use another account</a> : <Link href="/">Return to website</Link>}
        </div>
      </section>
    </main>
  );
}
