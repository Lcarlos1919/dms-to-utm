export type CodigoErro =
  | "PDF_SEM_TEXTO"
  | "NENHUM_VERTICE"
  | "FUSO_NAO_SUPORTADO"
  | "DATUM_NAO_SUPORTADO"
  | "CRS_NAO_SUPORTADO"
  | "PARAMETROS_INCOMPATIVEIS"
  | "COORDENADA_INVALIDA";

export type CodigoAviso =
  | "POLIGONO_ABERTO"
  | "CODIGO_DUPLICADO"
  | "MULTIPLOS_FUSOS"
  | "LINHA_NAO_RECONHECIDA"
  | "DIVERGENCIA_DISTANCIA"
  | "POUCOS_VERTICES"
  | "DATUM_NAO_IDENTIFICADO"
  | "FUSO_DECLARADO_DIFERENTE";

export interface Aviso {
  codigo: CodigoAviso;
  mensagem: string;
  /** Texto da linha, quando o aviso é sobre uma linha (LINHA_NAO_RECONHECIDA). */
  linha?: string;
}

export interface ErroMotor {
  codigo: CodigoErro;
  mensagem: string;
}

/** Vértice como sai do parser (ainda sem UTM). */
export interface VerticeBruto {
  seq: number;
  codigo: string;
  /** Texto original, ex.: -62°40'12,345" */
  lonDms: string;
  latDms: string;
  /** Graus decimais (SIRGAS 2000, EPSG:4674). */
  lon: number;
  lat: number;
  /** null quando o memorial traz "-" no lugar da altitude. */
  altitude: number | null;
  vante: string;
  azimuteDms: string;
  distancia: number;
  confrontacao: string;
}

export interface Vertice extends VerticeBruto {
  este: number;
  norte: number;
  /** true quando o usuário editou este/norte (lon/lat ficam desatualizados). Decisão D3. */
  editado: boolean;
}

export interface Crs {
  datum: "SIRGAS 2000";
  fuso: number;
  hemisferio: "S" | "N";
  epsg: number;
  nome: string;
}

export interface Geometria {
  areaM2: number;
  areaHa: number;
  perimetroGradeM: number;
  perimetroMemorialM: number;
  /** perímetro da grade / perímetro do memorial */
  razaoGradeSobreMemorial: number;
  /** maior |distância do memorial − distância geodésica GRS80|; null se não houver o que comparar. */
  divergenciaMaxDistanciaM: number | null;
  poligonoFechado: boolean;
}

export interface OpcoesMotor {
  /** Limite (m) acima do qual gera DIVERGENCIA_DISTANCIA. Padrão 0.1. */
  limiteDivergenciaM?: number;
  /** Fuso declarado no memorial; quando ausente, é inferido pelas coordenadas. */
  fusoDeclarado?: number;
  /** Hemisfério declarado no memorial; quando ausente, é inferido pelas coordenadas. */
  hemisferioDeclarado?: "S" | "N";
  /** Fusos aceitos (hemisfério Sul). Padrão 18 a 25. */
  fusoMin?: number;
  fusoMax?: number;
}

export type ResultadoMotor =
  | { ok: true; crs: Crs; vertices: Vertice[]; geometria: Geometria; avisos: Aviso[] }
  | { ok: false; erro: ErroMotor; avisos: Aviso[] };

/** Item de texto como o pdfjs/unpdf devolve (coordenadas da página, y cresce para cima). */
export interface ItemTexto {
  texto: string;
  x: number;
  y: number;
}
