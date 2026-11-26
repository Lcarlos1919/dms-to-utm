import { AdminPage } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { SuporteResposta } from "@/components/admin/suporte-resposta"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { resolveAdminUserDirectory } from "@/lib/admin-user-directory"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminSuportePage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.usersRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("suporte_mensagens")
    .select("id,user_id,autor,mensagem,created_at")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error("Falha ao carregar o suporte.")

  // Uma conversa por conta, da mais recente para a mais antiga.
  const porConta = new Map<string, { autor: string; mensagem: string; created_at: string }[]>()
  for (const linha of data ?? []) {
    const lista = porConta.get(linha.user_id) ?? []
    if (lista.length < 30) lista.push(linha)
    porConta.set(linha.user_id, lista)
  }
  const usuarios = await resolveAdminUserDirectory([...porConta.keys()])

  return (
    <AdminPage title="Suporte" description="Conversas do chat de suporte, por conta.">
      {porConta.size === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma mensagem de suporte ainda.</p>
      ) : (
        <div className="space-y-4">
          {[...porConta.entries()].map(([userId, mensagens]) => {
            const identidade = usuarios.get(userId)
            return (
              <section key={userId} aria-label={`Conversa com ${identidade?.fullName ?? userId}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-zinc-100">{identidade?.fullName ?? "Sem nome"}{identidade?.email ? <span className="ml-2 text-sm text-zinc-500">{identidade.email}</span> : null}</p>
                  <p className="text-xs text-zinc-500">{mensagens[0].autor === "usuario" ? "Aguardando resposta" : "Respondido"}</p>
                </header>
                <ol className="space-y-2">
                  {[...mensagens].reverse().map((m, i) => (
                    <li key={i} className={m.autor === "suporte" ? "text-right" : ""}>
                      <p className={"inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm " + (m.autor === "suporte" ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-100")}>
                        {m.mensagem}
                      </p>
                    </li>
                  ))}
                </ol>
                <SuporteResposta userId={userId} />
              </section>
            )
          })}
        </div>
      )}
    </AdminPage>
  )
}
