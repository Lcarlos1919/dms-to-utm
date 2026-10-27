import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { FreeMonthlyLimitForm } from "@/components/admin/free-monthly-limit-form"
import { DEFAULT_FREE_LIMIT } from "@/lib/usage"
import { formatDateTime } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"

export default async function AdminSettingsPage() {
  await requireAdmin()
  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("key,value,updated_at")
    .order("key")

  if (error) throw new Error("Falha ao carregar as configurações.")

  const settings = data ?? []
  const rawLimit = Number(settings.find((setting) => setting.key === "free_monthly_limit")?.value)
  const freeLimit = Number.isSafeInteger(rawLimit) && rawLimit >= 0 ? rawLimit : DEFAULT_FREE_LIMIT

  return (
    <AdminPage title="Configurações" description="Valores operacionais editáveis no Supabase.">
      <FreeMonthlyLimitForm initialValue={freeLimit} />
      <AdminTable
        headers={["Chave", "Valor", "Atualizado em"]}
        rows={settings.map((setting) => [
          setting.key,
          typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value),
          formatDateTime(setting.updated_at),
        ])}
      />
    </AdminPage>
  )
}
