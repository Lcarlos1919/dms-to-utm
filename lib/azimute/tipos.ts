// Tipos e validação (zod) dos dados do memorial por azimute guardados em projects.azimute_dados.
// Sem imports de servidor: pode ser usado no cliente.
import { z } from "zod"

export const AZIMUTE_STATUS = ["pendente", "lido", "revisado", "erro_leitura"] as const
export type AzimuteStatus = (typeof AZIMUTE_STATUS)[number]

const texto = (max: number) => z.string().trim().max(max)

export const segmentoSchema = z.object({
  de: texto(24),
  para: texto(24),
  azimute: z.number().finite().min(0).lt(360),
  azimuteTexto: texto(40),
  tipo: z.enum(["azimute", "rumo"]),
  distancia: z.number().finite().positive().max(1_000_000),
  confrontante: texto(200).optional(),
})

export const cabecalhoSchema = z.object({
  lote: texto(40).optional(),
  gleba: texto(40).optional(),
  nomeGleba: texto(120).optional(),
  municipio: texto(120).optional(),
  uf: texto(2).optional(),
  areaHa: z.number().finite().positive().max(10_000_000).optional(),
  perimetroM: z.number().finite().positive().max(10_000_000).optional(),
  inicio: texto(24).optional(),
})

export const plantaSchema = z.object({
  lote: texto(40).optional(),
  gleba: texto(40).optional(),
  areaHa: z.number().finite().optional(),
  perimetroM: z.number().finite().optional(),
})

export const azimuteDadosSchema = z.object({
  versao: z.literal(1),
  cabecalho: cabecalhoSchema,
  planta: plantaSchema,
  fuso: z.number().int().min(18).max(25),
  hemisferio: z.enum(["S", "N"]),
  datum: z.literal("SIRGAS 2000"),
  segmentos: z.array(segmentoSchema).max(500),
  avisosLeitura: z.array(z.string().max(300)).max(50),
  lidoEm: z.string().nullable(),
  revisadoEm: z.string().nullable(),
})

export type AzimuteDados = z.infer<typeof azimuteDadosSchema>
export type SegmentoSalvo = z.infer<typeof segmentoSchema>

/** Corpo aceito ao salvar a revisão (o servidor recalcula tudo; nada aqui é confiável por si só). */
export const salvarRevisaoSchema = z.object({
  cabecalho: cabecalhoSchema,
  fuso: z.number().int().min(18).max(25),
  hemisferio: z.enum(["S", "N"]),
  segmentos: z.array(segmentoSchema).max(500),
  confirmar: z.boolean(),
})
export type SalvarRevisao = z.infer<typeof salvarRevisaoSchema>

export const FUSO_PADRAO = 20
