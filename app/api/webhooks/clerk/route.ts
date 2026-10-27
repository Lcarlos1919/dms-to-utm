import { verifyWebhook } from "@clerk/nextjs/webhooks"
import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  let event

  try {
    event = await verifyWebhook(request)
  } catch {
    return new Response("Verificação do webhook falhou", { status: 400 })
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const { id, email_addresses, first_name, last_name, public_metadata } = event.data
    const email = email_addresses.find((address) => address.id === event.data.primary_email_address_id)?.email_address ?? email_addresses[0]?.email_address ?? null
    const fullName = [first_name, last_name].filter(Boolean).join(" ") || null
    const role = public_metadata && typeof public_metadata === "object" && "role" in public_metadata && public_metadata.role === "admin" ? "admin" : "user"
    const updatedAt = new Date().toISOString()
    const supabase = createAdminClient()

    const { error: createError } = await supabase.from("profiles").upsert(
      {
        user_id: id,
        email,
        full_name: fullName,
        role,
        can_create_memorials: true,
        can_delete_memorials: false,
        updated_at: updatedAt,
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    )

    if (createError) return new Response("Não foi possível sincronizar o usuário", { status: 500 })

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ email, full_name: fullName, role, updated_at: updatedAt })
      .eq("user_id", id)

    if (updateError) return new Response("Não foi possível sincronizar o usuário", { status: 500 })
  }

  if (event.type === "user.deleted") {
    const { error } = await createAdminClient().from("profiles").delete().eq("user_id", event.data.id)
    if (error) return new Response("Não foi possível remover o usuário", { status: 500 })
  }

  return Response.json({ received: true })
}

export async function GET() {
  return Response.json({ endpoint: "Clerk webhook ativo" })
}
