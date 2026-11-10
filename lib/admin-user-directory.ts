import "server-only"

import { clerkClient } from "@clerk/nextjs/server"
import { createAdminClient } from "@/lib/supabase/server"

export type AdminUserIdentity = {
  email: string | null
  fullName: string | null
}

export async function resolveAdminUserDirectory(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  const identities = new Map<string, AdminUserIdentity>()

  if (uniqueIds.length === 0) return identities

  const { data: profiles, error } = await createAdminClient()
    .from("profiles")
    .select("user_id,email,full_name")
    .in("user_id", uniqueIds)

  if (error) throw new Error("Não foi possível carregar os perfis dos usuários.")

  for (const profile of profiles ?? []) {
    identities.set(profile.user_id, {
      email: profile.email,
      fullName: profile.full_name,
    })
  }

  const missingIds = uniqueIds.filter((id) => {
    const profile = identities.get(id)
    return !profile?.email || !profile.fullName
  })

  if (missingIds.length > 0) {
    try {
      const clerk = await clerkClient()

      for (let index = 0; index < missingIds.length; index += 500) {
        const batch = missingIds.slice(index, index + 500)
        try {
          const { data: users } = await clerk.users.getUserList({ userId: batch, limit: batch.length, offset: 0 })

          for (const user of users) {
            const existing = identities.get(user.id)
            const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
            const fullName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || null
            identities.set(user.id, {
              email: existing?.email ?? email,
              fullName: existing?.fullName ?? fullName,
            })
          }
        } catch {
          continue
        }
      }
    } catch {
      return new Map(uniqueIds.map((id) => [id, identities.get(id) ?? { email: null, fullName: null }]))
    }
  }

  return new Map(uniqueIds.map((id) => [id, identities.get(id) ?? { email: null, fullName: null }]))
}
