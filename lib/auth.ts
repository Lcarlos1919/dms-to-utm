import "server-only"

import { auth, currentUser } from "@clerk/nextjs/server"
import { notFound, redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin-session"
import { createAdminClient } from "@/lib/supabase/server"

async function getAdminIdentity() {
  const user = await currentUser()
  const primaryEmail = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
  return {
    email: primaryEmail?.emailAddress?.toLowerCase() ?? null,
    hasPrimaryEmail: Boolean(primaryEmail),
    primaryEmailVerified: primaryEmail?.verification?.status === "verified",
  }
}

async function getAdminAccessState(userId: string | null) {
  const identity = await getAdminIdentity()
  let adminFound = false
  let adminActive = false
  let databaseError = false

  if (identity.email) {
    const { data, error } = await createAdminClient()
      .from("admin_users")
      .select("email, active")
      .eq("email", identity.email)
      .maybeSingle()
    databaseError = Boolean(error)
    adminFound = Boolean(data)
    adminActive = data?.active === true
  }

  const allowed = Boolean(userId && identity.email && identity.primaryEmailVerified && adminFound && adminActive)
  console.log("[v0] Admin access decision", {
    userIdPresent: Boolean(userId),
    sessionMissing: !userId,
    hasPrimaryEmail: identity.hasPrimaryEmail,
    primaryEmailVerified: identity.primaryEmailVerified,
    adminFound,
    adminActive,
    databaseError,
    allowed,
  })

  return { ...identity, adminFound, adminActive, allowed }
}

export async function requireUser() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  return userId
}

export async function hasAdminEmail() {
  return (await getAdminAccessState(null)).allowed
}

export async function isAdmin() {
  const { userId } = await auth()
  return (await getAdminAccessState(userId)).allowed
}

export async function requireAdmin() {
  const userId = await requireUser()
  if (!(await getAdminAccessState(userId)).allowed) notFound()
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
