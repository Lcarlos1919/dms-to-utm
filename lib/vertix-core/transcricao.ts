// Converte a transcrição estruturada de um memorial escaneado (lida por visão)
// nos mesmos tipos do leitor de texto. Funções puras: testáveis sem rede.
import { DMS_SRC, dmsToDeg, norm360, num, rumoToAzimute } from './angulos';
import type { MemorialLido, Segmento } from './memorial';

export interface LadoTranscrito {
  de: string;
  para: string;
  angulo: string;        // como está impresso: 90°29'42" ou N 45°10'20" E
  distancia: string;     // como está impresso: 2.062,35
  confrontante: string | null;
}

export interface MemorialTranscrito {
  imovel: string | null;
  lote: string | null;
  gleba: string | null;
  nomeGleba: string | null;
  municipio: string | null;
  uf: string | null;
  areaHa: string | null;
  perimetroM: string | null;
  lados: LadoTranscrito[];
  coordenadaInicial: {
    vertice: string | null;
    este: string | null;
    norte: string | null;
    latitude: string | null;
    longitude: string | null;
    fuso: string | null;
    datum: string | null;
  } | null;
}

const limpaId = (s: string) => s.replace(/\s+/g, '').replace(/[–—]/g, '-').toUpperCase();

/** Normaliza símbolos que o OCR costuma trocar (grau como "0" sobrescrito, "º", aspas tipográficas). */
function normalizaAngulo(txt: string): string {
  return txt
    .replace(/[º˚]/g, '°')
    .replace(/[′’´`]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "90°29'42\"" | "N 45°10'20\" E" | "90 29 42" -> azimute decimal. */
export function anguloTranscrito(txt: string): { az: number; tipo: 'azimute' | 'rumo'; texto: string } | undefined {
  const t = normalizaAngulo(txt);
  const rumo = new RegExp(`^([NS])\\s*${DMS_SRC}\\s*([EWLO])$`, 'i').exec(t);
  if (rumo) {
    const deg = dmsToDeg(rumo[2], rumo[3], rumo[4]);
    if (deg > 90) return undefined;
    return { az: norm360(rumoToAzimute(rumo[1].toUpperCase(), deg, rumo[5].toUpperCase())), tipo: 'rumo', texto: t };
  }
  const dms = new RegExp(`^${DMS_SRC}$`).exec(t);
  const partes = dms ? [dms[1], dms[2], dms[3]] : /^(\d{1,3})[\s°]+(\d{1,2})['\s]+(\d{1,2}(?:[.,]\d+)?)"?$/.exec(t)?.slice(1);
  if (!partes) return undefined;
  if (Number(partes[1] ?? 0) >= 60 || num(partes[2] ?? '0') >= 60) return undefined;
  const az = dmsToDeg(partes[0], partes[1], partes[2]);
  if (az >= 360) return undefined;
  return { az, tipo: 'azimute', texto: t };
}

/** "2.062,35" | "2062.35" | "250,16 m" -> metros. */
export function numeroTranscrito(txt: string | null | undefined): number | undefined {
  if (!txt) return undefined;
  const m = /\d[\d.,\s]*/.exec(txt);
  if (!m) return undefined;
  let s = m[0].replace(/\s/g, '');
  // Sem vírgula e com um único ponto seguido de 1-2 ou 4+ casas: ponto decimal.
  if (!s.includes(',') && /^\d+\.\d{1,2}$|^\d+\.\d{4,}$/.test(s)) return parseFloat(s);
  s = s.replace(/[.,]$/, '');
  const v = num(s);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Transcrição -> MemorialLido (mesmo formato do leitor de texto). */
export function memorialDaTranscricao(tr: MemorialTranscrito): MemorialLido {
  const avisos: string[] = [];
  const segmentos: Segmento[] = [];
  tr.lados.forEach((l, i) => {
    const ang = anguloTranscrito(l.angulo);
    const dist = numeroTranscrito(l.distancia);
    if (!ang || !dist) {
      avisos.push(`Lado ${i + 1} (${l.de} → ${l.para}): não foi possível ler ${!ang ? 'o ângulo' : 'a distância'}; confira na revisão.`);
      return;
    }
    segmentos.push({
      de: limpaId(l.de),
      para: limpaId(l.para),
      azimute: ang.az,
      azimuteTexto: ang.texto,
      tipo: ang.tipo,
      distancia: dist,
      ...(l.confrontante?.trim() ? { confrontante: l.confrontante.trim() } : {}),
    });
  });
  for (let i = 1; i < segmentos.length; i++) {
    if (segmentos[i].de !== segmentos[i - 1].para) {
      avisos.push(`A sequência quebra entre ${segmentos[i - 1].para} e ${segmentos[i].de}; confira na revisão.`);
      break;
    }
  }
  const out: MemorialLido = {
    imovel: tr.imovel ?? undefined,
    lote: tr.lote ? tr.lote.replace(/^lote\s*/i, '').trim().toUpperCase() : undefined,
    gleba: tr.gleba ? tr.gleba.replace(/^gleba\s*/i, '').trim().toUpperCase() : undefined,
    nomeGleba: tr.nomeGleba ?? undefined,
    municipio: tr.municipio ?? undefined,
    uf: tr.uf ? tr.uf.trim().toUpperCase().slice(0, 2) : undefined,
    areaHa: numeroTranscrito(tr.areaHa),
    perimetroM: numeroTranscrito(tr.perimetroM),
    inicio: segmentos[0]?.de,
    segmentos,
    avisos,
  };
  return out;
}

/** Monta um texto equivalente ao de um memorial digital com a coordenada inicial,
 *  para reaproveitar `lerCoordenadaInicial` (mesmas regras de fuso, datum e hemisfério). */
export function textoDaCoordenada(tr: MemorialTranscrito): string | undefined {
  const c = tr.coordenadaInicial;
  if (!c) return undefined;
  const partes: string[] = [];
  const v = c.vertice ? limpaId(c.vertice) : tr.lados[0] ? limpaId(tr.lados[0].de) : '';
  if (c.este && c.norte) partes.push(`Inicia-se no vértice ${v}, de coordenadas N ${c.norte} m e E ${c.este} m`);
  else if (c.latitude && c.longitude) partes.push(`Inicia-se no vértice ${v}, de coordenadas Latitude ${c.latitude} e Longitude ${c.longitude}`);
  else return undefined;
  if (c.fuso) partes.push(`Fuso ${c.fuso}`);
  if (c.datum) partes.push(`Datum ${c.datum}`);
  return partes.join(', ') + '.';
}
