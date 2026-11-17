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

const ponto = z.tuple([z.number().finite(), z.number().finite()])

/** De onde veio o ponto de partida (âncora) da poligonal. */
export const FONTES_ANCORA = ["memorial", "base_fundiaria", "manual", "mapa"] as const
export type FonteAncora = (typeof FONTES_ANCORA)[number]

export const ancoraSchema = z.object({
  fonte: z.enum(FONTES_ANCORA),
  vertice: texto(24),
  este: z.number().finite().min(100_000).max(900_000),
  norte: z.number().finite().min(0).max(10_000_000),
  automatica: z.boolean(),
  detalhe: texto(300).optional(),
  definidaEm: z.string(),
})
export type Ancora = z.infer<typeof ancoraSchema>

/** Coordenada encontrada no texto do memorial (pode estar incompleta: sem fuso, datum não suportado...). */
export const coordenadaMemorialSchema = z.object({
  vertice: texto(24).optional(),
  este: z.number().finite().optional(),
  norte: z.number().finite().optional(),
  lon: z.number().finite().optional(),
  lat: z.number().finite().optional(),
  fuso: z.number().int().optional(),
  hemisferio: z.enum(["S", "N"]).optional(),
  datum: texto(20).optional(),
})

export const candidataSchema = z.object({
  vertice: texto(24),
  este: z.number().finite(),
  norte: z.number().finite(),
  pontuacao: z.number().finite(),
  dentro: z.number().int(),
  sobreDivisa: z.number().int(),
  total: z.number().int(),
})
export type CandidataSalva = z.infer<typeof candidataSchema>

export const baseFundiariaSchema = z.object({
  fonte: z.enum(["banco", "geoportal"]),
  nomeGleba: texto(160),
  gleba: texto(40),
  lote: texto(40),
  areaOficialHa: z.number().finite().optional(),
  fuso: z.number().int(),
  hemisferio: z.enum(["S", "N"]),
  anel: z.array(ponto).max(5000),       // vértices do lote em UTM (fuso acima)
  motivo: texto(300),
  avisos: z.array(texto(300)).max(20),
})
export type BaseFundiaria = z.infer<typeof baseFundiariaSchema>

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
  // Etapas D2–D5 (opcionais: dados gravados pela D1 continuam válidos)
  fusoDeclarado: z.boolean().optional(),
  coordenadaMemorial: coordenadaMemorialSchema.optional(),
  base: baseFundiariaSchema.nullable().optional(),
  candidatas: z.array(candidataSchema).max(10).optional(),
  ancora: ancoraSchema.nullable().optional(),
  pendencia: texto(400).nullable().optional(),
  usoRegistrado: z.boolean().optional(),
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

/** Corpo aceito ao definir a âncora manualmente (D3). */
export const definirAncoraSchema = z.object({
  fonte: z.enum(["base_fundiaria", "manual", "mapa", "memorial"]),
  vertice: texto(24).min(1),
  este: z.number().finite().min(100_000).max(900_000),
  norte: z.number().finite().min(0).max(10_000_000),
  fuso: z.number().int().min(18).max(25),
  hemisferio: z.enum(["S", "N"]),
})
export type DefinirAncora = z.infer<typeof definirAncoraSchema>
