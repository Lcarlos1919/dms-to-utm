import { AdminPage } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { getStaffContext, isStaffAdmin } from "@/lib/admin-auth"

export default async function StaffPage() {
  const staff = await getStaffContext()
  if (!staff || !isStaffAdmin(staff)) return <Forbidden />
  return <AdminPage title="Equipe" description="Gerencie os membros da organização administrativa do TopoCAD."><div /></AdminPage>
}
