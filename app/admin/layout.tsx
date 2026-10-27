import type React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
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

  const sidebarFooter = (
    <Link
      href="/dashboard"
      prefetch={false}
      className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Voltar ao app</span>
    </Link>
  )

  return (
    <AppShell
      variant="admin"
      sidebarFooter={sidebarFooter}
      adminPermissions={getStaffPermissions(staff.role)}
      adminRole={staff.role}
    >
      {children}
    </AppShell>
  )
}
