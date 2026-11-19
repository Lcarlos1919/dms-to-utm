import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod/v4"
import type { MemorialTranscrito } from "@/lib/vertix-core/transcricao"

// Leitura por visão de PDFs escaneados (sem camada de texto): memoriais antigos do INCRA,
// cópias de cartório, plantas digitalizadas. Só roda quando o PDF não tem texto.

const MODELO_PADRAO = "claude-opus-5-5"

const ladoSchema = z.object({
  de: z.string().describe("Vértice de origem, como impresso (ex.: M-1343)"),
  para: z.string().describe("Vértice de destino, como impresso (ex.: M-1341)"),
  angulo: z.string().describe(`Azimute ou rumo exatamente como impresso, normalizado para 90°29'42" ou N 45°10'20" E`),
  distancia: z.string().describe("Comprimento como impresso (ex.: 2.062,35)"),
  confrontante: z.string().nullable().describe("Confrontante ou observação do lado (ex.: L-25), ou null"),
})

const memorialSchema = z.object({
  imovel: z.string().nullable(),
  lote: z.string().nullable(),
  gleba: z.string().nullable().describe("Número da gleba (ex.: 05)"),
  nomeGleba: z.string().nullable().describe("Nome da gleba ou do imóvel-mãe (ex.: Rio Branco)"),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  areaHa: z.string().nullable().describe("Área em hectares como impressa (ex.: 51,5297)"),
  perimetroM: z.string().nullable().describe("Perímetro em metros como impresso (ex.: 4.623,040)"),
  lados: z.array(ladoSchema),
  coordenadaInicial: z
    .object({
      vertice: z.string().nullable(),
      este: z.string().nullable(),
      norte: z.string().nullable(),
      latitude: z.string().nullable().describe(`Com o hemisfério, ex.: 10°12'13,4" S`),
      longitude: z.string().nullable().describe(`Com o hemisfério, ex.: 62°40'12,3" W`),
      fuso: z.string().nullable(),
      datum: z.string().nullable(),
    })
    .nullable()
    .describe("Coordenada de algum vértice, se o documento trouxer; senão null"),
})

const plantaSchema = z.object({
  lote: z.string().nullable(),
  gleba: z.string().nullable(),
  areaHa: z.string().nullable(),
  perimetroM: z.string().nullable(),
})

const INSTRUCOES = `Você transcreve documentos de topografia escaneados (memoriais descritivos e plantas de imóveis rurais).
Transcreva exatamente o que está impresso; não calcule, não corrija e não invente valores. Campo ausente ou ilegível: null.
Não transcreva nome de proprietário nem documentos pessoais.
Ângulos: o símbolo de grau às vezes aparece como um "0" pequeno sobrescrito (90⁰29'42") — escreva sempre com "°".
Tabelas de perímetro ("LADOS / AZIMUTES / COMPRIMENTOS"): cada linha "M-1343 M-1341 90°29'42" 250,16 L-25" vira um lado com de=M-1343, para=M-1341.
Memorial corrido ("do vértice X segue com azimute ... e distância ... até o vértice Y"): um lado por trecho, na ordem do texto.
Aspas de repetição (" ") na coluna de observações repetem o valor da linha de cima: escreva o valor.
Mantenha a ordem dos lados e todos eles, até voltar ao vértice inicial, inclusive lados muito curtos.`

export class LeituraVisaoIndisponivel extends Error {}

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new LeituraVisaoIndisponivel("Leitura de PDF escaneado não configurada (ANTHROPIC_API_KEY).")
  }
  return new Anthropic({ timeout: 120_000, maxRetries: 1 })
}

async function transcrever<T extends z.ZodType>(bytes: Uint8Array, schema: T, pedido: string): Promise<z.infer<T>> {
  const client = cliente()
  const resposta = await client.beta.messages.parse({
    model: process.env.VERTIX_OCR_MODEL || MODELO_PADRAO,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: INSTRUCOES,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") },
          },
          { type: "text", text: pedido },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(schema) },
  })
  if (resposta.stop_reason === "refusal") throw new Error("A leitura do documento foi recusada.")
  if (resposta.stop_reason === "max_tokens") throw new Error("O documento é longo demais para a leitura automática.")
  if (!resposta.parsed_output) throw new Error("A leitura do documento não retornou dados válidos.")
  return resposta.parsed_output as z.infer<T>
}

export function transcreverMemorial(bytes: Uint8Array): Promise<MemorialTranscrito> {
  return transcrever(
    bytes,
    memorialSchema,
    "Transcreva o cabeçalho, a tabela (ou descrição) do perímetro e, se houver, a coordenada de algum vértice deste memorial descritivo.",
  )
}

export function transcreverRodapePlanta(bytes: Uint8Array): Promise<z.infer<typeof plantaSchema>> {
  return transcrever(
    bytes,
    plantaSchema,
    "Transcreva do carimbo/rodapé desta planta o lote, a gleba, a área (ha) e o perímetro (m).",
  )
}
