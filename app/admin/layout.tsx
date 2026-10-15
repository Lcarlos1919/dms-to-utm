import type React from "react"
import { AppShell } from "@/components/app-shell/app-shell"
import { requireStaff } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff()
  return <AppShell variant="admin" adminPermissions={staff.permissions} adminRole={staff.orgRole}>{children}</AppShell>
}
