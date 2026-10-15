import "server-only"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getStaffContext } from "@/lib/admin-auth"

export async function requireUser() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  return userId
}

export async function hasAdminEmail() {
  return Boolean(await getStaffContext())
}

export async function isAdmin() {
  return Boolean(await getStaffContext())
}

export async function requireAdmin() {
  const context = await getStaffContext()
  if (!context) redirect("/dashboard")
  return context.userId
}

type AdminApiResult = { ok: true; userId: string } | { ok: false; response: Response }

export async function requireAdminApi(): Promise<AdminApiResult> {
  const context = await getStaffContext()
  if (!context) return { ok: false, response: Response.json({ error: "Não autorizado" }, { status: 401 }) }
  return { ok: true, userId: context.userId }
}
