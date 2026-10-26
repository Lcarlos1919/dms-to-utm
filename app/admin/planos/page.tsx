import { AdminPage } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"

export default async function PlansPage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.plansRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  return <AdminPage title="Planos" description="Consulte os planos e limites disponíveis no TopoCAD."><div /></AdminPage>
}
