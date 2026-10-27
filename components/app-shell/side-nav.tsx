"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FolderOpen,
  FilePlus2,
  CreditCard,
  LayoutDashboard,
  Users,
  FolderKanban,
  Receipt,
  BarChart3,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; permission?: string; adminOnly?: boolean }

const navItems: Record<"dashboard" | "admin", NavItem[]> = {
  dashboard: [
    { href: "/dashboard", label: "Projetos", icon: FolderOpen, exact: true },
    { href: "/dashboard/novo", label: "Novo projeto", icon: FilePlus2 },
    { href: "/dashboard/planos", label: "Planos", icon: CreditCard },
  ],
  admin: [
    { href: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
    { href: "/admin/usuarios", label: "Usuários", icon: Users, permission: "org:users:read" },
    { href: "/admin/staff", label: "Equipe", icon: Users, permission: "org:staff:manage", adminOnly: true },
    { href: "/admin/planos", label: "Planos", icon: CreditCard, permission: "org:plans:read" },
    { href: "/admin/projetos", label: "Projetos", icon: FolderKanban, permission: "org:projects:read" },
    { href: "/admin/assinaturas", label: "Assinaturas", icon: Receipt, permission: "org:billing:read" },
    { href: "/admin/uso", label: "Uso", icon: BarChart3, permission: "org:usage:read" },
    { href: "/admin/logs", label: "Logs", icon: ScrollText, permission: "org:audit:read" },
    { href: "/admin/configuracoes", label: "Configurações", icon: Settings, permission: "org:staff:manage", adminOnly: true },
  ],
}

export function SideNav({ variant, adminPermissions = [], adminRole, createProjectDisabledReason }: { variant: "dashboard" | "admin"; adminPermissions?: string[]; adminRole?: string; createProjectDisabledReason?: string }) {
  const pathname = usePathname()
  const visibleItems = navItems[variant].filter((item) => variant !== "admin" || (!item.adminOnly || adminRole === "org:admin") && (!item.permission || adminRole === "org:admin" || adminPermissions.includes(item.permission)))

  return (
    <ul className="flex md:flex-col gap-1 overflow-x-auto">
      {visibleItems.map((item) => {
        const Icon = item.icon
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const disabledReason = variant === "dashboard" && item.href === "/dashboard/novo"
          ? createProjectDisabledReason
          : undefined

        return (
          <li key={item.href}>
            {disabledReason ? (
              <span title={disabledReason} className="block">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap text-zinc-500 opacity-50"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
              </span>
            ) : (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
