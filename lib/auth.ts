import "server-only"

import { auth, currentUser } from "@clerk/nextjs/server"
import { notFound, redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin-session"
import { createAdminClient } from "@/lib/supabase/server"

async function getVerifiedEmail() {
  const user = await currentUser()
  return user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress?.toLowerCase() ?? null
}

async function isRegisteredAdmin(email: string | null) {
  if (!email) return false
  const { data, error } = await createAdminClient().from("admin_users").select("email").eq("email", email).eq("active", true).maybeSingle()
  return !error && Boolean(data)
}

export async function requireUser() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  return userId
}

export async function hasAdminEmail() {
  return isRegisteredAdmin(await getVerifiedEmail())
}

export async function isAdmin() {
  const { userId } = await auth()
  return Boolean(userId && (await hasAdminEmail()))
}

export async function requireAdmin() {
  const userId = await requireUser()
  if (!(await hasAdminEmail())) notFound()
  const session = await getAdminSession()
  if (!session || session.userId !== userId) redirect("/admin/login")
  return userId
}

type AdminApiResult = { ok: true; userId: string } | { ok: false; response: Response }

export async function requireAdminApi(): Promise<AdminApiResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, response: new Response(null, { status: 404 }) }
  if (!(await hasAdminEmail())) return { ok: false, response: new Response(null, { status: 404 }) }
  const session = await getAdminSession()
  if (!session || session.userId !== userId) return { ok: false, response: new Response(null, { status: 404 }) }
  return { ok: true, userId }
}
