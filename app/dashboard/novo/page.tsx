import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { getUsageStatus } from "@/lib/usage"
import { canUseFeature } from "@/lib/features"
import { UploadDropzone } from "@/components/dashboard/upload-dropzone"
import { SetupNotice } from "@/components/setup-notice"

export const metadata: Metadata = { title: "Novo projeto — Vertix" }

export default async function NovoProjetoPage() {
  const userId = await requireUser()

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-zinc-100">Novo projeto</h1>
        <SetupNotice variables={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]} />
      </div>
    )
  }

  const [usage, canUseAzimute] = await Promise.all([
    getUsageStatus(userId),
    canUseFeature(userId, "memorial_azimute"),
  ])
  if (!usage.canCreateMemorials) {
    return (
      <div className="max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h1 className="font-display text-2xl font-semibold text-zinc-100">Criação bloqueada</h1>
        <p role="alert" className="mt-2 text-sm text-zinc-400">
          A criação de memoriais está bloqueada para esta conta. Contate o suporte para solicitar a liberação.
        </p>
        <Link href="/dashboard" className="mt-5 inline-flex rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900">
          Voltar aos projetos
        </Link>
      </div>
    )
  }
  if (!usage.canCreate && !canUseAzimute) redirect("/dashboard/planos")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-zinc-100">Novo projeto</h1>
        {usage.limit !== null && (
          <p className="text-sm text-zinc-500">
            Você usou {usage.used} de {usage.limit} memoriais este mês.
          </p>
        )}
      </div>
      <UploadDropzone canUseAzimute={canUseAzimute} canCreateCoordinates={usage.canCreate} />
    </div>
  )
}
