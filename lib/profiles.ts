import "server-only"

import { clerkClient } from "@clerk/nextjs/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function ensureProfile(userId: string) {
  const supabase = createAdminClient()
  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (lookupError) throw new Error("Não foi possível verificar o perfil da conta.")
  if (profile) return

  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
  const fullName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || null

  const { error: upsertError } = await supabase.from("profiles").upsert(
    { user_id: user.id, email, full_name: fullName },
    { onConflict: "user_id", ignoreDuplicates: true },
  )

  if (upsertError) throw new Error("Não foi possível criar o perfil da conta.")
}
