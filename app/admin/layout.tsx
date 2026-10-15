import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { AppShell } from "@/components/app-shell/app-shell"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth()

  if (!userId) redirect("/admin/login")
  if (!orgId || orgId !== process.env.CLERK_STAFF_ORG_ID) redirect("/dashboard")

  return <AppShell variant="admin">{children}</AppShell>
}
