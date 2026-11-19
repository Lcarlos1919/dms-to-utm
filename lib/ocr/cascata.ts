import "server-only"

import { avaliarMemorial, avaliarMemorialOcr, normalizarOcr, NOME_MOTOR, planejarMotores, totaisDeclarados, type AvaliacaoLeitura, type MotorOcr } from "@/lib/vertix-core/ocr"
import { lerRodapePlanta, type RodapePlanta } from "@/lib/vertix-core/planta"
import { memorialDaTranscricao, numeroTranscrito, textoDaCoordenada } from "@/lib/vertix-core/transcricao"
import type { MemorialLido } from "@/lib/vertix-core/memorial"
import { abrirPdf, motoresConfigurados, ocrAzure, ocrGoogle, ocrSpace, ocrTesseract } from "@/lib/ocr/motores"

/** Tempo máximo para começar um novo motor (a rota tem 300 s). */
const ORCAMENTO_MS = 200_000

export interface Tentativa {
  motor: MotorOcr
  ok: boolean
  motivo: string
  ms: number
}

export interface LeituraEscaneada {
  memorial: MemorialLido
  /** Texto onde procurar a coordenada inicial (texto do OCR ou equivalente montado da transcrição). */
  textoCoordenada: string
  motor: MotorOcr
  aprovada: boolean
  motivo: string
  tentativas: Tentativa[]
}

async function textoDoMotor(motor: Exclude<MotorOcr, "claude">, bytes: Uint8Array, pdf: Awaited<ReturnType<typeof abrirPdf>>): Promise<string> {
  if (motor === "tesseract") return ocrTesseract(pdf)
  if (motor === "ocrspace") return ocrSpace(bytes)
  if (motor === "azure") return ocrAzure(bytes)
  return ocrGoogle(bytes, pdf.numPages)
}

/**
 * Lê um memorial escaneado tentando os motores na ordem planejada para o arquivo
 * (páginas e tamanho). Para no primeiro resultado que passa na conferência
 * (lados encadeados, fecha e bate com o perímetro declarado). Se nenhum passar,
 * devolve a melhor leitura para revisão manual, com o motivo.
 */
export async function lerMemorialEscaneado(bytes: Uint8Array): Promise<LeituraEscaneada | null> {
  const pdf = await abrirPdf(bytes)
  const tentativas: Tentativa[] = []
  let melhor: { av: AvaliacaoLeitura; motor: MotorOcr; textoCoordenada: string } | null = null
  const inicio = Date.now()
  try {
    const plano = planejarMotores({ paginas: pdf.numPages, bytes: bytes.byteLength }, motoresConfigurados())
    for (const motor of plano) {
      if (Date.now() - inicio > ORCAMENTO_MS) break
      const t0 = Date.now()
      try {
        let av: AvaliacaoLeitura
        let textoCoordenada: string
        if (motor === "claude") {
          const { transcreverMemorial } = await import("@/lib/azimute/ler-imagem")
          const tr = await transcreverMemorial(bytes)
          av = avaliarMemorial(memorialDaTranscricao(tr))
          textoCoordenada = textoDaCoordenada(tr) ?? ""
        } else {
          const texto = await textoDoMotor(motor, bytes, pdf)
          av = avaliarMemorialOcr(texto)
          textoCoordenada = normalizarOcr(texto)
        }
        tentativas.push({ motor, ok: av.aprovada, motivo: av.motivo, ms: Date.now() - t0 })
        if (!melhor || av.pontos > melhor.av.pontos) melhor = { av, motor, textoCoordenada }
        if (av.aprovada) break
      } catch (e) {
        tentativas.push({ motor, ok: false, motivo: e instanceof Error ? e.message : "erro", ms: Date.now() - t0 })
      }
    }
  } finally {
    await pdf.destroy().catch(() => {})
  }
  console.info("[ocr] memorial:", tentativas.map((t) => `${t.motor}=${t.ok ? "ok" : t.motivo} (${t.ms} ms)`).join("; ") || "nenhum motor")
  if (!melhor || !melhor.av.memorial.segmentos.length) return null
  return {
    memorial: melhor.av.memorial,
    textoCoordenada: melhor.textoCoordenada,
    motor: melhor.motor,
    aprovada: melhor.av.aprovada,
    motivo: melhor.av.motivo,
    tentativas,
  }
}

/** Rodapé da planta escaneada: aceita o primeiro motor que achar área e perímetro. */
export async function lerRodapeEscaneado(bytes: Uint8Array): Promise<(RodapePlanta & { motor?: MotorOcr }) | null> {
  const pdf = await abrirPdf(bytes)
  const inicio = Date.now()
  let parcial: (RodapePlanta & { motor?: MotorOcr }) | null = null
  try {
    for (const motor of planejarMotores({ paginas: pdf.numPages, bytes: bytes.byteLength }, motoresConfigurados())) {
      if (Date.now() - inicio > ORCAMENTO_MS / 2) break
      try {
        let r: RodapePlanta
        if (motor === "claude") {
          const { transcreverRodapePlanta } = await import("@/lib/azimute/ler-imagem")
          const t = await transcreverRodapePlanta(bytes)
          r = {
            lote: t.lote?.replace(/^lote\s*/i, "").trim().toUpperCase() || undefined,
            gleba: t.gleba?.replace(/^(gleba|gl)\s*-?\s*/i, "").trim().toUpperCase() || undefined,
            areaHa: numeroTranscrito(t.areaHa),
            perimetroM: numeroTranscrito(t.perimetroM),
          }
        } else {
          const texto = normalizarOcr(await textoDoMotor(motor, bytes, pdf))
          r = lerRodapePlanta(texto)
          const decl = totaisDeclarados(texto)
          r.areaHa ??= decl.areaHa
          r.perimetroM ??= decl.perimetroM
        }
        if (r.areaHa && r.perimetroM) return { ...r, motor }
        if (!parcial && (r.areaHa || r.perimetroM)) parcial = { ...r, motor }
      } catch (e) {
        console.info(`[ocr] planta ${NOME_MOTOR[motor]}:`, e instanceof Error ? e.message : e)
      }
    }
  } finally {
    await pdf.destroy().catch(() => {})
  }
  return parcial
}
