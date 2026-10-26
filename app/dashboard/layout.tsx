import type React from "react"
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { ShieldCheck } from "lucide-react"
import { AppShell } from "@/components/app-shell/app-shell"
import { requireUser } from "@/lib/auth"
import { getStaffAccess } from "@/lib/staff"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const staff = await getStaffAccess()
  const sidebarFooter = staff.isStaff ? (
    <Link
      href="/admin"
      prefetch={false}
      className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
    >
      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Painel admin</span>
    </Link>
  ) : undefined

  return (
    <AppShell
      variant="dashboard"
      sidebarFooter={sidebarFooter}
      topbarExtra={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-visible">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "!h-9 !w-9",
                userButtonTrigger: "!h-9 !w-9",
              },
            }}
          />
        </div>
      }
    >
      {children}
    </AppShell>
  )
}
