"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

type ExportFormat = "pdf" | "xlsx" | "dxf"

const labels: Record<ExportFormat, string> = {
  pdf: "PDF original",
  xlsx: "XLSX",
  dxf: "DXF",
}

export function AdminProjectDownloads({
  projectId,
  hasPdf,
  canExport,
}: {
  projectId: string
  hasPdf: boolean
  canExport: boolean
}) {
  const [pending, setPending] = useState<ExportFormat | null>(null)
  const [message, setMessage] = useState("")

  async function download(format: ExportFormat) {
    setPending(format)
    setMessage("")
    try {
      const response = await fetch("/api/admin/project-download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, format }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || typeof result?.url !== "string") {
        setMessage(result?.error ?? "Não foi possível preparar o download.")
        return
      }
      window.location.assign(result.url)
    } catch {
      setMessage("Não foi possível preparar o download.")
    } finally {
      setPending(null)
    }
  }

  const formats: ExportFormat[] = ["pdf", "xlsx", "dxf"]

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5" aria-label="Downloads do projeto">
      <div>
        <h2 className="font-medium text-zinc-100">Arquivos do projeto</h2>
        <p className="mt-1 text-sm text-zinc-500">Os links de download expiram após 60 segundos.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => {
          const unavailable = format === "pdf" ? !hasPdf : !canExport
          const reason = format === "pdf" ? "O PDF original não está disponível." : "Processe o projeto antes de exportar."
          return (
            <span key={format} title={unavailable ? reason : undefined}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unavailable || pending !== null}
                aria-busy={pending === format}
                onClick={() => void download(format)}
              >
                <Download data-icon="inline-start" aria-hidden="true" />
                {pending === format ? "Preparando…" : `Baixar ${labels[format]}`}
              </Button>
            </span>
          )
        })}
      </div>
      <p className="min-h-5 text-sm text-red-400" role="status" aria-live="polite">{message}</p>
    </section>
  )
}
