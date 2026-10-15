import { AdminPage } from "@/components/admin/admin-page"
import { UserPermissionControls } from "@/components/admin/user-permission-controls"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission, ADMIN_PERMISSIONS } from "@/lib/admin-auth"

export default async function AdminUsersPage() {
  await requirePermission(ADMIN_PERMISSIONS.usersRead)
  const { data } = await createAdminClient().from("profiles").select("user_id,email,plan,role,bonus_credits,can_create_memorials,can_delete_memorials,created_at").order("created_at", { ascending: false }).limit(100)
  return <AdminPage title="Usuários" description="Habilite individualmente as funções premium de criação e exclusão de memoriais."><div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-sm"><thead className="border-b border-zinc-800 text-zinc-500"><tr>{["E-mail", "Plano", "Permissões", "Perfil", "Criado em"].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{(data ?? []).map((user) => <tr key={user.user_id} className="border-b border-zinc-800/70 last:border-0"><td className="px-4 py-4 text-zinc-200">{user.email ?? "—"}</td><td className="px-4 py-4 text-zinc-400">{user.plan}</td><td className="px-4 py-4"><UserPermissionControls user={user} /></td><td className="px-4 py-4 text-zinc-400">{user.role}</td><td className="px-4 py-4 text-zinc-500">{new Date(user.created_at).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div></AdminPage>
}
