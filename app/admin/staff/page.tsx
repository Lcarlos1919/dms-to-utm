import { clerkClient } from "@clerk/nextjs/server"
import { AdminPage } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, getStaffContext, requirePermission } from "@/lib/admin-auth"
import { inviteStaffMember, changeStaffRole, removeStaffMember, revokeStaffInvitation } from "./actions"

const roles = ["org:admin", "org:support", "org:finance", "org:viewer"] as const
const permissionMatrix = [
  ["org:admin", "Acesso total, equipe e configurações"],
  ["org:support", "Gerencia usuários e projetos; consulta auditoria"],
  ["org:finance", "Consulta usuários, assinaturas e uso; gerencia planos"],
  ["org:viewer", "Consulta usuários e projetos"],
]

export default async function StaffPage() {
  const staff = await getStaffContext()
  if (!staff) return <Forbidden />
  try {
    await requirePermission(ADMIN_PERMISSIONS.staffManage)
  } catch {
    return <Forbidden />
  }

  const client = await clerkClient()
  const [memberships, invitations] = await Promise.all([
    client.organizations.getOrganizationMembershipList({ organizationId: staff.orgId, limit: 100 }),
    client.organizations.getOrganizationInvitationList({ organizationId: staff.orgId, status: ["pending"], limit: 100 }),
  ])

  return (
    <AdminPage title="Equipe" description="Convide e administre os colaboradores da organização Staff.">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-lg font-medium text-zinc-100">Convidar colaborador</h2>
        <form action={inviteStaffMember} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input name="email" type="email" required placeholder="colaborador@empresa.com" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
          <select name="role" defaultValue="org:viewer" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">Enviar convite</button>
        </form>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/80"><tr>{["Colaborador", "E-mail", "Função", "Entrada", "Ações"].map((item) => <th key={item} className="px-4 py-3 text-zinc-500">{item}</th>)}</tr></thead>
          <tbody>
            {memberships.data.map((membership) => {
              const user = membership.publicUserData
              const userId = user?.userId ?? ""
              const canEditRole = roles.some((role) => role === membership.role)
              return (
                <tr key={membership.id} className="border-t border-zinc-800/70">
                  <td className="px-4 py-3 text-zinc-200">{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Sem nome"}</td>
                  <td className="px-4 py-3 text-zinc-400">{user?.identifier || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{membership.role}</td>
                  <td className="px-4 py-3 text-zinc-400">{membership.createdAt ? new Date(membership.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3">
                    {userId === staff.userId ? <span className="text-xs text-zinc-600">Sua conta</span> : (
                      <div className="flex flex-wrap gap-2">
                        <form action={changeStaffRole}>
                          <input type="hidden" name="userId" value={userId} />
                          <select name="role" defaultValue={canEditRole ? membership.role : ""} required aria-label={`Função de ${user?.identifier || userId}`} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                            {!canEditRole && <option value="" disabled>Selecione uma função</option>}
                            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                          </select>
                          <button className="ml-2 text-xs text-zinc-300 underline">Salvar</button>
                        </form>
                        <form action={removeStaffMember}>
                          <input type="hidden" name="userId" value={userId} />
                          <button className="text-xs text-red-400 underline">Remover</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-lg font-medium text-zinc-100">Convites pendentes</h2>
        <div className="mt-4 flex flex-col gap-2">
          {invitations.data.length ? invitations.data.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm">
              <span className="text-zinc-300">{invitation.emailAddress} · {invitation.role}</span>
              <form action={revokeStaffInvitation}>
                <input type="hidden" name="invitationId" value={invitation.id} />
                <button className="text-xs text-red-400 underline">Revogar</button>
              </form>
            </div>
          )) : <p className="text-sm text-zinc-500">Nenhum convite pendente.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-lg font-medium text-zinc-100">Matriz de permissões</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="pb-2 text-zinc-500">Função</th><th className="pb-2 text-zinc-500">Acesso</th></tr></thead>
            <tbody>{permissionMatrix.map(([role, permissions]) => <tr key={role} className="border-t border-zinc-800/70"><td className="py-2 text-zinc-200">{role}</td><td className="py-2 text-zinc-400">{permissions}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </AdminPage>
  )
}
