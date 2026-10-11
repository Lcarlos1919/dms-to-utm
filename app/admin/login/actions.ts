"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { createAdminSession, isAdminSessionConfigured, setAdminSession, verifyPanelPassword } from "@/lib/admin-session"

export async function loginAdmin(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent("/admin/login")}`)
  const user = await currentUser()
  const email = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress?.toLowerCase()
  if (!email) redirect("/admin/not-found")
  const db = createAdminClient()
  const { data: admin } = await db.from("admin_users").select("email, active").eq("email", email).eq("active", true).maybeSingle()
  if (!admin || !isAdminSessionConfigured()) redirect("/admin/not-found")
  const { count } = await db.from("admin_login_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("success", false).gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
  const password = String(formData.get("password") ?? "")
  const allowed = (count ?? 0) < 5
  const success = allowed && verifyPanelPassword(password)
  await db.from("admin_login_attempts").insert({ user_id: userId, success })
  if (!success) redirect("/admin/login?error=credenciais")
  await setAdminSession(userId)
  redirect("/admin")
}
