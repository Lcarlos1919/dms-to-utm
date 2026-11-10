"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AdminProjectDeleteButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function handleDelete() {
    if (!window.confirm(`Excluir o projeto “${projectName}” e os arquivos associados? Essa ação não pode ser desfeita.`)) return

    setPending(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/projects", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: projectId }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage(result?.error ?? "Não foi possível excluir o projeto.")
        return
      }

      router.refresh()
    } catch {
      setMessage("Não foi possível excluir o projeto.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={pending} aria-busy={pending}>
        <Trash2 data-icon="inline-start" aria-hidden="true" />
        {pending ? "Excluindo…" : "Excluir"}
      </Button>
      <span className="text-xs text-red-400" role="status" aria-live="polite">{message}</span>
    </div>
  )
}
