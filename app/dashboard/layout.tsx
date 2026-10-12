import type React from "react"
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { AppShell } from "@/components/app-shell/app-shell"
import { isAdmin, requireUser } from "@/lib/auth"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const admin = await isAdmin()

  return (
    <AppShell
      variant="dashboard"
      topbarExtra={
        <div className="flex items-center gap-3">
          {admin ? (
            <Link
              href="/admin"
              aria-label="Abrir painel admin"
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Painel admin
            </Link>
          ) : null}
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      }
    >
      {children}
    </AppShell>
  )
}
