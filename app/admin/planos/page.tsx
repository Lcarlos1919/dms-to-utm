import { AdminPage } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { getStaffContext, isStaffAdmin, ADMIN_PERMISSIONS } from "@/lib/admin-auth"

export default async function PlansPage() {
  const staff = await getStaffContext()
  if (!staff || (!isStaffAdmin(staff) && !staff.permissions.includes(ADMIN_PERMISSIONS.plansManage))) return <Forbidden />
  return <AdminPage title="Planos" description="Gerencie os planos e limites disponíveis no TopoCAD."><div /></AdminPage>
}
