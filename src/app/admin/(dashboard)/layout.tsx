import { redirect } from "next/navigation";
import { isAuthenticated } from "@/server/auth";
import { AdminShell } from "@/components/admin/admin-shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}
