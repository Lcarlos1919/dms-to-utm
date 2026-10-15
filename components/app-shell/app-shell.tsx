import type React from "react"
import Link from "next/link"
import { SideNav } from "@/components/app-shell/side-nav"

export function AppShell({
  variant,
  topbarExtra,
  sidebarFooter,
  adminPermissions,
  adminRole,
  children,
}: {
  variant: "dashboard" | "admin"
  topbarExtra?: React.ReactNode
  sidebarFooter?: React.ReactNode
  adminPermissions?: string[]
  adminRole?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-950 md:flex">
      <aside className="md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 border-b md:border-b-0 md:border-r border-zinc-900 flex flex-col">
        <div className="h-14 flex items-center gap-2 px-5 border-b border-zinc-900">
          <Link href="/" className="font-display text-lg font-semibold text-zinc-100">
            TopoCAD
          </Link>
          {variant === "admin" && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-900">
              Admin
            </span>
          )}
        </div>
        <nav aria-label="Navegação principal" className="p-3 flex-1">
          <SideNav variant={variant} adminPermissions={adminPermissions} adminRole={adminRole} />
        </nav>
        {sidebarFooter && <div className="hidden md:block p-3 border-t border-zinc-900">{sidebarFooter}</div>}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 flex items-center justify-end gap-3 px-6 border-b border-zinc-900">
          {topbarExtra}
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-100">Sair</Link>
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  )
}
