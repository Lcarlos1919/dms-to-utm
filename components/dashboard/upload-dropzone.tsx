"use client"

import { useRef, useState, type DragEvent, type FormEvent, type RefObject } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileText, FileUp, X } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { createProject } from "@/app/dashboard/novo/actions"
import { useSupabase } from "@/lib/supabase/client"

const MAX_SIZE = 10 * 1024 * 1024

type Stage = "idle" | "creating" | "uploading" | "verifying" | "done" | "error"
type MemorialType = "coordenadas" | "azimute"
type UploadTarget = "memorial" | "planta"

type PdfUploadFieldProps = {
  fieldId: string
  label: string
  title: string
  file: File | null
  inputRef: RefObject<HTMLInputElement | null>
  dragging: boolean
  busy: boolean
  onSelect: (file: File | undefined) => void
  onRemove: () => void
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
}

function PdfUploadField({
  fieldId,
  label,
  title,
  file,
  inputRef,
  dragging,
  busy,
  onSelect,
  onRemove,
  onDragOver,
  onDragLeave,
  onDrop,
}: PdfUploadFieldProps) {
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={fieldId} className="text-zinc-300">{label}</FieldLabel>
      <DashboardCard>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          disabled={busy}
          className={cn(
            "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors sm:p-12",
            dragging ? "border-zinc-400 bg-zinc-900" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600",
          )}
        >
          <FileUp className="size-8 text-zinc-500" aria-hidden="true" />
          <span className="font-medium text-zinc-200">{title}</span>
          <span className="text-sm text-zinc-500">ou clique para selecionar · máx. 10 MB</span>
        </button>
      </DashboardCard>
      <Input
        ref={inputRef}
        id={fieldId}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label={label}
        disabled={busy}
        onChange={(event) => onSelect(event.target.files?.[0])}
      />

      {file && (
        <DashboardCard>
          <div className="flex items-center gap-3 px-4 py-3">
            <FileText className="size-5 text-zinc-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{file.name}</span>
            <span className="shrink-0 text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            {!busy && (
              <button
                type="button"
                onClick={onRemove}
                className="shrink-0 text-zinc-500 hover:text-zinc-200"
                aria-label={`Remover ${label.toLowerCase()}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </DashboardCard>
      )}
    </Field>
  )
}

const stageProgress: Record<Stage, number> = { idle: 0, creating: 25, uploading: 65, verifying: 90, done: 100, error: 0 }
const stageLabel: Record<Stage, string> = {
  idle: "",
  creating: "Criando projeto...",
  uploading: "Enviando PDF...",
  verifying: "Validando arquivos...",
  done: "Concluído! Redirecionando...",
  error: "",
}

async function cancelPendingAzimuteUpload(projectId: string) {
  await fetch("/api/projetos/azimute", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId }),
  }).catch(() => null)
}

export function UploadDropzone({
  canUseAzimute,
  canCreateCoordinates,
}: {
  canUseAzimute: boolean
  canCreateCoordinates: boolean
}) {
  const router = useRouter()
  const supabase = useSupabase()
  const memorialInputRef = useRef<HTMLInputElement>(null)
  const plantaInputRef = useRef<HTMLInputElement>(null)
  const [memorialFile, setMemorialFile] = useState<File | null>(null)
  const [plantaFile, setPlantaFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [memorialType, setMemorialType] = useState<MemorialType>("coordenadas")
  const [draggingTarget, setDraggingTarget] = useState<UploadTarget | null>(null)
  const [stage, setStage] = useState<Stage>("idle")
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)

  const busy = stage === "creating" || stage === "uploading" || stage === "verifying" || stage === "done"

  function selectPdf(selected: File | undefined, target: UploadTarget) {
    setError(null)
    setSuccessMessage(null)
    setLimitReached(false)
    if (!selected) return
    if (selected.type !== "application/pdf" || !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Envie um arquivo PDF.")
      return
    }
    if (selected.size > MAX_SIZE) {
      setError("O arquivo deve ter no máximo 10 MB.")
      return
    }

    if (target === "memorial") {
      setMemorialFile(selected)
      if (!name) setName(selected.name.replace(/\.pdf$/i, ""))
    } else {
      setPlantaFile(selected)
    }
  }

  function removePdf(target: UploadTarget) {
    setError(null)
    setLimitReached(false)
    if (target === "memorial") {
      setMemorialFile(null)
      if (memorialInputRef.current) memorialInputRef.current.value = ""
    } else {
      setPlantaFile(null)
      if (plantaInputRef.current) plantaInputRef.current.value = ""
    }
    setSuccessMessage(null)
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>, target: UploadTarget) {
    event.preventDefault()
    setDraggingTarget(target)
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, target: UploadTarget) {
    event.preventDefault()
    setDraggingTarget(null)
    selectPdf(event.dataTransfer.files[0], target)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !memorialFile || !name.trim()) return
    if (memorialType === "coordenadas" && !canCreateCoordinates) return
    if (memorialType === "azimute" && (!canUseAzimute || !plantaFile)) return

    setError(null)
    setSuccessMessage(null)
    setLimitReached(false)
    setStage("creating")

    if (memorialType === "coordenadas") {
      const formData = new FormData()
      formData.set("name", name)
      formData.set("file", memorialFile)
      formData.set("memorial_type", "coordenadas")
      setStage("uploading")

      try {
        const created = await createProject(formData)
        if (!created.ok) {
          setStage("error")
          setError(created.error)
          setLimitReached(Boolean(created.limitReached))
          return
        }

        setStage("done")
        router.push(`/dashboard/projeto/${created.projectId}`)
      } catch {
        setStage("error")
        setError("Não foi possível criar o projeto. Tente novamente.")
      }
      return
    }

    if (!canUseAzimute || !plantaFile) return

    let preparedProjectId: string | null = null
    try {
      const prepareResponse = await fetch("/api/projetos/azimute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          memorial_type: "azimute",
          name,
          memorial: { name: memorialFile.name, type: memorialFile.type, size: memorialFile.size },
          planta: { name: plantaFile.name, type: plantaFile.type, size: plantaFile.size },
        }),
      })
      const preparation = await prepareResponse.json().catch(() => null) as {
        ok?: boolean
        projectId?: string
        memorial?: { path: string; token: string; fileName: string }
        planta?: { path: string; token: string; fileName: string }
        erro?: { mensagem?: string }
      } | null
      if (!prepareResponse.ok || !preparation?.ok || !preparation.projectId || !preparation.memorial || !preparation.planta) {
        setStage("error")
        setError(preparation?.erro?.mensagem ?? "Não foi possível preparar o envio dos arquivos.")
        return
      }
      preparedProjectId = preparation.projectId

      setStage("uploading")
      const [memorialUpload, plantaUpload] = await Promise.all([
        supabase.storage.from("memoriais").uploadToSignedUrl(
          preparation.memorial.path,
          preparation.memorial.token,
          memorialFile,
          { contentType: "application/pdf" },
        ),
        supabase.storage.from("memoriais").uploadToSignedUrl(
          preparation.planta.path,
          preparation.planta.token,
          plantaFile,
          { contentType: "application/pdf" },
        ),
      ])
      if (memorialUpload.error || plantaUpload.error) {
        await cancelPendingAzimuteUpload(preparedProjectId)
        preparedProjectId = null
        setStage("error")
        setError(memorialUpload.error
          ? "Não foi possível enviar o memorial descritivo."
          : "Não foi possível enviar a planta do lote.")
        return
      }

      setStage("verifying")
      const finalizeResponse = await fetch("/api/projetos/azimute", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          memorial_type: "azimute",
          projectId: preparedProjectId,
          name,
          memorialFileName: preparation.memorial.fileName,
          plantaFileName: preparation.planta.fileName,
        }),
      })
      const finalized = await finalizeResponse.json().catch(() => null) as {
        ok?: boolean
        erro?: { mensagem?: string }
      } | null
      if (!finalizeResponse.ok || !finalized?.ok) {
        await cancelPendingAzimuteUpload(preparedProjectId)
        preparedProjectId = null
        setStage("error")
        setError(finalized?.erro?.mensagem ?? "Não foi possível validar os arquivos enviados.")
        return
      }

      preparedProjectId = null
      setStage("idle")
      setSuccessMessage("Arquivos recebidos. O processamento deste tipo de memorial será ativado em breve.")
      setMemorialFile(null)
      setPlantaFile(null)
      if (memorialInputRef.current) memorialInputRef.current.value = ""
      if (plantaInputRef.current) plantaInputRef.current.value = ""
    } catch {
      if (preparedProjectId) await cancelPendingAzimuteUpload(preparedProjectId)
      setStage("error")
      setError("Não foi possível enviar os arquivos. Tente novamente.")
    }
  }

  function changeMemorialType(value: string) {
    if (value !== "coordenadas" && value !== "azimute") return
    setMemorialType(value)
    setError(null)
    setSuccessMessage(null)
    setLimitReached(false)
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
      <FieldSet className="gap-3">
        <FieldLegend id="memorial-type-legend" variant="label" className="mb-0 text-zinc-300">
          Tipo de memorial
        </FieldLegend>
        <ToggleGroup
          type="single"
          value={memorialType}
          onValueChange={changeMemorialType}
          aria-labelledby="memorial-type-legend"
          className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <ToggleGroupItem
            value="coordenadas"
            disabled={busy}
            className="flex h-auto min-h-24 w-full items-start justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left whitespace-normal transition-colors hover:border-zinc-600 hover:bg-zinc-900 data-[state=on]:border-zinc-200 data-[state=on]:bg-zinc-900/80 data-[state=on]:text-zinc-100"
          >
            <span className="flex flex-col items-start gap-1">
              <span className="font-medium text-zinc-100">Memorial com coordenadas</span>
              <span className="text-sm font-normal text-zinc-500">Vértices em graus, minutos e segundos</span>
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="azimute"
            disabled={!canUseAzimute || busy}
            className="flex h-auto min-h-24 w-full items-start justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left whitespace-normal transition-colors hover:border-zinc-600 hover:bg-zinc-900 data-[state=on]:border-zinc-200 data-[state=on]:bg-zinc-900/80 data-[state=on]:text-zinc-100"
          >
            <span className="flex flex-col items-start gap-1">
              <span className="font-medium text-zinc-100">Memorial com azimute e distância</span>
              <span className="text-sm font-normal text-zinc-500">Sem coordenadas; precisa do memorial e da planta</span>
            </span>
            {!canUseAzimute && <Badge variant="outline" className="shrink-0 border-zinc-700 text-zinc-500">Em breve</Badge>}
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription aria-live="polite" className="text-zinc-500">
          {memorialType === "coordenadas"
            ? "Envie o memorial descritivo em PDF."
            : "Envie o memorial descritivo e a planta do lote em PDF."}
        </FieldDescription>
      </FieldSet>

      {!canCreateCoordinates && memorialType === "coordenadas" && (
        <p role="status" className="text-sm text-zinc-400">
          A cota mensal foi atingida para memoriais com coordenadas. Escolha o tipo Azimute, se disponível, ou{" "}
          <Link href="/dashboard/planos" className="text-zinc-100 underline underline-offset-4">consulte os planos</Link>.
        </p>
      )}

      <FieldGroup className={cn("gap-4", memorialType === "azimute" && "grid sm:grid-cols-2")}>
        <PdfUploadField
          fieldId="memorial-file"
          label="Memorial descritivo (PDF)"
          title="Arraste o PDF do memorial aqui"
          file={memorialFile}
          inputRef={memorialInputRef}
          dragging={draggingTarget === "memorial"}
          busy={busy}
          onSelect={(selected) => selectPdf(selected, "memorial")}
          onRemove={() => removePdf("memorial")}
          onDragOver={(event) => handleDragOver(event, "memorial")}
          onDragLeave={() => setDraggingTarget(null)}
          onDrop={(event) => handleDrop(event, "memorial")}
        />
        {memorialType === "azimute" && (
          <PdfUploadField
            fieldId="planta-file"
            label="Planta do lote (PDF)"
            title="Arraste a planta do lote aqui"
            file={plantaFile}
            inputRef={plantaInputRef}
            dragging={draggingTarget === "planta"}
            busy={busy}
            onSelect={(selected) => selectPdf(selected, "planta")}
            onRemove={() => removePdf("planta")}
            onDragOver={(event) => handleDragOver(event, "planta")}
            onDragLeave={() => setDraggingTarget(null)}
            onDrop={(event) => handleDrop(event, "planta")}
          />
        )}
      </FieldGroup>

      <FieldGroup className="gap-2">
        <Field>
          <FieldLabel htmlFor="project-name" className="text-zinc-300">Nome do projeto</FieldLabel>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSuccessMessage(null)
            }}
            placeholder="Ex.: Fazenda Boa Vista — Gleba 2"
            maxLength={120}
            required
            disabled={busy}
            className="border-zinc-800 bg-zinc-900 text-zinc-100"
          />
        </Field>
      </FieldGroup>

      {busy && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <Progress value={stageProgress[stage]} className="bg-zinc-800" aria-label="Progresso do envio" />
          <p className="text-sm text-zinc-400">
            {memorialType === "azimute" && stage === "uploading" ? "Enviando arquivos..." : stageLabel[stage]}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}{" "}
          {limitReached && (
            <Link href="/dashboard/planos" className="text-zinc-100 underline underline-offset-4">
              Ver planos
            </Link>
          )}
        </p>
      )}

      {successMessage && <p role="status" aria-live="polite" className="text-sm text-zinc-300">{successMessage}</p>}

      <button
        type="submit"
        disabled={
          !memorialFile ||
          !name.trim() ||
          busy ||
          (memorialType === "coordenadas" && !canCreateCoordinates) ||
          (memorialType === "azimute" && (!canUseAzimute || !plantaFile))
        }
        className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-50"
      >
        {memorialType === "azimute" ? "Enviar arquivos" : "Processar memorial"}
      </button>
    </form>
  )
}
