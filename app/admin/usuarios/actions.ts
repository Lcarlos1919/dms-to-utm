"use server"

import { clerkClient } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { ADMIN_PERMISSIONS, requirePermission } from "@/lib/admin-auth"
import { writeAdminAuditLog } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/server"

export async function syncClerkUsers() {
  const access = await requirePermission(ADMIN_PERMISSIONS.usersSync)
  const supabase = createAdminClient()
  let syncedCount = 0
  let offset = 0

  try {
    await writeAdminAuditLog({ actorId: access.userId, action: "users.clerk_sync.started" })
    const clerk = await clerkClient()

    while (true) {
      const page = await clerk.users.getUserList({ limit: 100, offset })
      if (page.data.length === 0) break

      const rows = page.data.map((user) => ({
        user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null,
        full_name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      }))

      const { error: createError } = await supabase.from("profiles").upsert(
        rows.map((row) => ({
          ...row,
          can_create_memorials: true,
          can_delete_memorials: false,
        })),
        { onConflict: "user_id", ignoreDuplicates: true },
      )
      if (createError) throw new Error("Falha ao criar os perfis sincronizados.")

      const { error } = await supabase.from("profiles").upsert(rows, { onConflict: "user_id" })
      if (error) throw new Error("Falha ao sincronizar os perfis.")

      syncedCount += rows.length
      offset += page.data.length
      if (offset >= page.totalCount) break
    }

    await writeAdminAuditLog({
      actorId: access.userId,
      action: "users.clerk_sync.completed",
      metadata: { syncedCount },
    })
    revalidatePath("/admin/usuarios")
    revalidatePath("/admin")
    return { ok: true as const, count: syncedCount }
  } catch {
    try {
      await writeAdminAuditLog({
        actorId: access.userId,
        action: "users.clerk_sync.failed",
        metadata: { syncedCount },
      })
    } catch {
      return { ok: false as const, error: "Não foi possível sincronizar os usuários do Clerk." }
    }

    return { ok: false as const, error: "Não foi possível sincronizar os usuários do Clerk." }
  }
}
