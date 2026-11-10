"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { retryProject } from "@/app/dashboard/novo/actions"

export function RetryProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function retry() {
    setMessage(null)
    startTransition(async () => {
      const result = await retryProject(projectId)
      if (!result.ok) {
        setMessage("message" in result ? result.message : result.error)
        return
      }
      setMessage("Memorial reprocessado.")
      router.refresh()
    })
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={retry}
        disabled={isPending}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RotateCcw className={isPending ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
        {isPending ? "Reprocessando..." : "Tentar processar novamente"}
      </button>
      {message && <p role="status" className="text-sm text-zinc-400">{message}</p>}
    </div>
  )
}
