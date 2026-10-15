import "server-only"

import { createAdminClient } from "@/lib/supabase/server"

export async function writeAdminAuditLog(input: {
  actorId: string
  targetUserId?: string | null
  action: string
  metadata?: Record<string, unknown>
}) {
  const supabase = createAdminClient()
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: input.actorId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
  })
  if (error) console.error("admin_audit_log insert failed:", error.message)
}

export async function writeAuditLog(input: {
  actorId: string
  targetUserId?: string | null
  action: string
  metadata?: Record<string, unknown>
}) {
  const supabase = createAdminClient()
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
  })
  if (error) console.error("audit_logs insert failed:", error.message)
}
