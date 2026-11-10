import { Skeleton } from "@/components/ui/skeleton"
import { DashboardCard } from "@/components/dashboard/dashboard-card"

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Carregando...</span>
      <Skeleton className="h-8 w-48 bg-zinc-900" />
      <DashboardCard className="w-full max-w-sm" backgroundColor="#111113" borderRadius={16}>
        <Skeleton className="h-28 w-full bg-zinc-900" />
      </DashboardCard>
      <DashboardCard className="w-full" backgroundColor="#111113" borderRadius={16}>
        <Skeleton className="h-64 w-full bg-zinc-900" />
      </DashboardCard>
    </div>
  )
}
