"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { syncClerkUsers } from "@/app/admin/usuarios/actions"

export function ClerkSyncButton() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function handleSync() {
    setPending(true)
    setMessage("")

    try {
      const result = await syncClerkUsers()
      setMessage(result.ok ? `${result.count} usuário(s) sincronizado(s).` : result.error)
    } catch {
      setMessage("Não foi possível sincronizar os usuários do Clerk.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={handleSync} disabled={pending} aria-busy={pending}>
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        {pending ? "Sincronizando…" : "Sincronizar usuários do Clerk"}
      </Button>
      <span className="text-sm text-zinc-400" role="status" aria-live="polite">{message}</span>
    </div>
  )
}
