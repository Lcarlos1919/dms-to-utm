"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AdminProjectReprocessButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function reprocess() {
    if (!window.confirm(`Reprocessar “${projectName}”? O uso mensal do proprietário poderá ser atualizado.`)) return

    setPending(true)
    setMessage("")
    try {
      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: projectId }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(result?.error ?? "Não foi possível reprocessar o projeto.")
        return
      }
      setMessage("Reprocessamento concluído.")
      router.refresh()
    } catch {
      setMessage("Não foi possível reprocessar o projeto.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={reprocess} disabled={pending} aria-busy={pending}>
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        {pending ? "Reprocessando…" : "Reprocessar"}
      </Button>
      <span className="text-xs text-zinc-400" role="status" aria-live="polite">{message}</span>
    </div>
  )
}
