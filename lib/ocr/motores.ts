import "server-only"

import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import type { MotorOcr } from "@/lib/vertix-core/ocr"

// Motores de OCR que devolvem TEXTO (o Claude, que devolve a tabela pronta, fica em lib/azimute/ler-imagem.ts).
// Nenhum depende de Docker: Tesseract roda em WebAssembly dentro da função; os demais são APIs HTTP.

// No bundle do Next, `__non_webpack_require__` é o require nativo do Node (o webpack não reescreve);
// fora dele (testes com tsx), usa createRequire.
declare const __non_webpack_require__: NodeJS.Require | undefined
const requireLocal: NodeJS.Require =
  typeof __non_webpack_require__ === "function" ? __non_webpack_require__ : createRequire(path.join(process.cwd(), "package.json"))
const pastaPacote = (nome: string) => path.dirname(requireLocal.resolve(`${nome}/package.json`))

export class MotorIndisponivel extends Error {}

export function motoresConfigurados(): Set<MotorOcr> {
  const s = new Set<MotorOcr>()
  if (process.env.OCR_TESSERACT !== "off") s.add("tesseract")
  if (process.env.OCR_SPACE_API_KEY) s.add("ocrspace")
  if (process.env.AZURE_DI_ENDPOINT && process.env.AZURE_DI_KEY) s.add("azure")
  if (process.env.GOOGLE_VISION_API_KEY) s.add("google")
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) s.add("claude")
  return s
}

// ---------- PDF -> imagens (pdf.js + canvas nativo; decodifica JBIG2/JPEG2000 dos scans) ----------

type PdfDoc = { numPages: number; getPage(n: number): Promise<any>; destroy(): Promise<void> }

export async function abrirPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const dir = pastaPacote("pdfjs-dist")
  const pdfjs = await import(/* webpackIgnore: true */ pathToFileURL(path.join(dir, "legacy/build/pdf.mjs")).href)
  const tarefa = pdfjs.getDocument({
    data: bytes.slice(),
    wasmUrl: path.join(dir, "wasm") + path.sep,
    isEvalSupported: false,
    verbosity: 0,
  })
  const doc = await tarefa.promise
  return { numPages: doc.numPages, getPage: (n: number) => doc.getPage(n), destroy: () => tarefa.destroy() }
}

/** Página -> PNG com ~2400 px de largura (bom para OCR de texto datilografado). */
async function paginaPng(pdf: PdfDoc, n: number): Promise<Buffer> {
  const { createCanvas } = requireLocal("@napi-rs/canvas")
  const page = await pdf.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: Math.min(5, Math.max(1, 2400 / base.width)) })
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
  page.cleanup()
  return canvas.toBuffer("image/png")
}

// ---------- 1. Tesseract.js (local, grátis, sem limite) ----------

export async function ocrTesseract(pdf: PdfDoc): Promise<string> {
  const { createWorker } = requireLocal("tesseract.js")
  const langPath = path.join(pastaPacote("@tesseract.js-data/por"), "4.0.0_best_int")
  const worker = await createWorker("por", 1, { langPath, gzip: true, cachePath: os.tmpdir() })
  try {
    await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" })
    const partes: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const { data } = await worker.recognize(await paginaPng(pdf, n))
      partes.push(data.text)
    }
    return partes.join("\n")
  } finally {
    await worker.terminate()
  }
}

// ---------- 2. OCR.space (API grátis; arquivo até 1 MB e 3 páginas) ----------

export async function ocrSpace(bytes: Uint8Array): Promise<string> {
  const key = process.env.OCR_SPACE_API_KEY
  if (!key) throw new MotorIndisponivel("OCR.space não configurado")
  const form = new URLSearchParams({
    base64Image: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
    filetype: "PDF",
    language: "por",
    OCREngine: process.env.OCR_SPACE_ENGINE || "2",
    isTable: "true",
    scale: "true",
    detectOrientation: "true",
  })
  const r = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(90_000),
  })
  if (!r.ok) throw new Error(`OCR.space HTTP ${r.status}`)
  const j = (await r.json()) as { IsErroredOnProcessing?: boolean; ErrorMessage?: string | string[]; ParsedResults?: { ParsedText?: string }[] }
  if (j.IsErroredOnProcessing) throw new Error(`OCR.space: ${[j.ErrorMessage].flat().join(" ")}`)
  return (j.ParsedResults ?? []).map((p) => p.ParsedText ?? "").join("\n")
}

// ---------- 3. Azure Document Intelligence (plano F0: 500 páginas/mês, 2 páginas por envio) ----------

export async function ocrAzure(bytes: Uint8Array): Promise<string> {
  const endpoint = process.env.AZURE_DI_ENDPOINT?.replace(/\/+$/, "")
  const key = process.env.AZURE_DI_KEY
  if (!endpoint || !key) throw new MotorIndisponivel("Azure não configurado")
  const r = await fetch(`${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30&locale=pt-BR`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Source: Buffer.from(bytes).toString("base64") }),
    signal: AbortSignal.timeout(30_000),
  })
  if (r.status !== 202) throw new Error(`Azure HTTP ${r.status}`)
  const operacao = r.headers.get("operation-location")
  if (!operacao) throw new Error("Azure: resposta sem Operation-Location")
  const fim = Date.now() + 90_000
  while (Date.now() < fim) {
    await new Promise((ok) => setTimeout(ok, 1500))
    const s = await fetch(operacao, { headers: { "Ocp-Apim-Subscription-Key": key }, signal: AbortSignal.timeout(20_000) })
    if (!s.ok) throw new Error(`Azure HTTP ${s.status}`)
    const j = (await s.json()) as { status: string; analyzeResult?: { content?: string }; error?: { message?: string } }
    if (j.status === "succeeded") return j.analyzeResult?.content ?? ""
    if (j.status === "failed") throw new Error(`Azure: ${j.error?.message ?? "falhou"}`)
  }
  throw new Error("Azure: tempo esgotado")
}

// ---------- 4. Google Cloud Vision (1.000 páginas/mês grátis; depois pago) ----------

export async function ocrGoogle(bytes: Uint8Array, paginas: number): Promise<string> {
  const key = process.env.GOOGLE_VISION_API_KEY
  if (!key) throw new MotorIndisponivel("Google Cloud Vision não configurado")
  const content = Buffer.from(bytes).toString("base64")
  const partes: string[] = []
  for (let ini = 1; ini <= paginas; ini += 5) {
    const pages = Array.from({ length: Math.min(5, paginas - ini + 1) }, (_, i) => ini + i)
    const r = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: { content, mimeType: "application/pdf" },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["pt"] },
            pages,
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!r.ok) throw new Error(`Google Vision HTTP ${r.status}`)
    const j = (await r.json()) as {
      responses?: { error?: { message?: string }; responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[] }[]
    }
    const resp = j.responses?.[0]
    if (resp?.error) throw new Error(`Google Vision: ${resp.error.message}`)
    for (const p of resp?.responses ?? []) partes.push(p.fullTextAnnotation?.text ?? "")
  }
  return partes.join("\n")
}
