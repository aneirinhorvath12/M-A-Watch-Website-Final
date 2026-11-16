import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminActor } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

// Every page in this segment calls requireAdmin()/requireSuperUser() with its
// own path before loading data, so anonymous visitors are redirected to the
// login page with a return_to that preserves the deep link. The layout only
// decides whether to wrap the page in the administration shell.
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminActor();
  if (!actor) return <>{children}</>;
  return <AdminShell actor={actor}>{children}</AdminShell>;
}
