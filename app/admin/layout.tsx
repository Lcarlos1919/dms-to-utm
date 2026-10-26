import type React from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell/app-shell"
import { getStaffPermissions } from "@/lib/admin-auth"
import { getStaffAccess, isStaffRole } from "@/lib/staff"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const staff = await getStaffAccess()
  if (!staff.isStaff || !isStaffRole(staff.role)) redirect("/dashboard")

  return (
    <AppShell
      variant="admin"
      adminPermissions={getStaffPermissions(staff.role)}
      adminRole={staff.role}
    >
      {children}
    </AppShell>
  )
}
