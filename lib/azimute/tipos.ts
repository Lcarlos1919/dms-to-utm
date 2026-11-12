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

const lonLat = z.tuple([z.number().finite(), z.number().finite()])
const fonteLote = z.enum(["banco", "geoportal"])
const fontePosicao = z.enum(["banco", "geoportal", "memorial"])

/** Resultado da busca do lote na base fundiária (D2). Só números e identificação do lote; sem dados de proprietário. */
export const localizacaoSchema = z.object({
  versao: z.literal(1),
  /** Posição escolhida pelo usuário no mapa (D3). Só guarda o índice: os vértices vêm sempre das candidatas salvas. */
  confirmada: z.object({ indice: z.number().int().min(0).max(4), confirmadoEm: z.string() }).nullable().optional(),
  localizadoEm: z.string(),
  estado: z.enum(["encontrado", "nao_encontrado", "sem_fontes"]),
  fonte: fontePosicao.nullable(),
  motivo: z.string().max(400),
  avisos: z.array(z.string().max(400)).max(30),
  divergenciaM: z.number().nullable(),
  lote: z
    .object({
      feicaoId: z.string().max(120).nullable(),
      nomeGleba: z.string().max(120),
      gleba: z.string().max(40),
      lote: z.string().max(40),
      areaOficialHa: z.number().nullable(),
      baseData: z.string().max(40).nullable(),
      anel: z.array(lonLat).max(3000),
    })
    .nullable(),
  alternativas: z
    .array(z.object({ fonte: fonteLote, feicaoId: z.string().max(120).nullable(), nomeGleba: z.string().max(120), gleba: z.string().max(40), lote: z.string().max(40) }))
    .max(10),
  sigef: z.object({ consultado: z.boolean(), ok: z.boolean(), parcelas: z.number().int().min(0), falhas: z.array(z.string().max(300)).max(5) }),
  candidatas: z
    .array(
      z.object({
        verticeMemorial: z.string().max(24),
        indiceLote: z.number().int().min(0),
        dentro: z.number().int().min(0),
        sobreDivisa: z.number().int().min(0),
        total: z.number().int().min(0),
        azimutesCasados: z.number().int().min(0),
        pontuacao: z.number(),
        pontuacaoFinal: z.number(),
        confianca: z.enum(["sigef_confirmada", "sigef_divisa", "siglo", "coordenadas"]),
        sigef: z.object({
          nivel: z.enum(["confirmada", "divisa", "nenhum"]),
          verticesCasados: z.number().int().min(0),
          verticesNaDivisa: z.number().int().min(0),
          residuoM: z.number().nullable(),
          codigo: z.string().max(60).nullable(),
          deslocamento: z.object({ dE: z.number(), dN: z.number() }).nullable(),
        }),
        vertices: z.array(z.object({ nome: z.string().max(24), lon: z.number(), lat: z.number() })).max(500),
      }),
    )
    .max(5),
})
export type Localizacao = z.infer<typeof localizacaoSchema>

export const azimuteDadosSchema = z.object({
  versao: z.literal(1),
  cabecalho: cabecalhoSchema,
  planta: plantaSchema,
  fuso: z.number().int().min(18).max(25),
  hemisferio: z.enum(["S", "N"]),
  datum: z.literal("SIRGAS 2000"),
  segmentos: z.array(segmentoSchema).max(500),
  avisosLeitura: z.array(z.string().max(300)).max(50),
  /** Coordenadas geográficas escritas no memorial, por vértice (quando o memorial traz). */
  coordenadas: z.record(z.string().max(24), z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })).optional(),
  lidoEm: z.string().nullable(),
  revisadoEm: z.string().nullable(),
  /** Preenchido pelo D2; apagado sempre que a tabela é salva de novo (a posição deixa de valer). */
  localizacao: localizacaoSchema.optional(),
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
