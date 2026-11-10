import { AlertTriangle } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"

export function SetupNotice({ variables }: { variables: string[] }) {
  return (
    <DashboardCard backgroundColor="#1c1917" borderRadius={16}>
      <div role="alert" className="flex gap-3 p-5 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="font-medium text-amber-200">Supabase não configurado</p>
          <p className="mt-1 text-amber-200/80">
            Adicione as variáveis <span className="font-mono">{variables.join(", ")}</span> em Settings → Vars e execute{" "}
            <span className="font-mono">supabase/001_schema.sql, depois 002_admin-security.sql e 003_staff-rbac.sql</span> no SQL Editor do Supabase.
          </p>
        </div>
      </div>
    </DashboardCard>
  )
}
