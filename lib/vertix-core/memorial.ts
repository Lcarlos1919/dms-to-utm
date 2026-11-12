import { DMS_SRC, dmsToDeg, norm360, num, rumoToAzimute } from './angulos';

export interface Segmento {
  de: string;
  para: string;
  azimute: number;       // graus decimais (0..360), já convertido de rumo se preciso
  azimuteTexto: string;  // como estava no memorial (para a tabela de revisão)
  tipo: 'azimute' | 'rumo';
  distancia: number;     // metros
  confrontante?: string;
}
export interface MemorialLido {
  imovel?: string; lote?: string; gleba?: string; nomeGleba?: string;
  municipio?: string; uf?: string;
  areaHa?: number; perimetroM?: number;
  inicio?: string;
  segmentos: Segmento[];
  /** Coordenadas geográficas escritas no próprio memorial, por vértice (graus decimais; sul e oeste negativos). */
  coordenadas?: Record<string, { lat: number; lon: number }>;
  avisos: string[];
}

const ID = '([A-Za-z]{1,4}\\s?[-–—]?\\s?\\d{1,4}[A-Za-z]?(?:-\\d+)?)';
const limpaId = (s: string) => s.replace(/\s+/g, '').replace(/[–—]/g, '-').toUpperCase();
const ANG_AZ = DMS_SRC;
const ANG_RUMO = `([NS])\\s*${DMS_SRC}\\s*([EWLO])`;

export function normalizaTexto(t: string): string {
  return t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

export function lerMemorial(textoBruto: string): MemorialLido {
  const avisos: string[] = [];
  const t = normalizaTexto(textoBruto);
  const out: MemorialLido = { segmentos: [], avisos };

  // Cabeçalho
  const imv = /Im[óo]vel:\s*(.+?)(?=\s+Propriet|\s+Munic[íi]pio|$)/i.exec(t);
  if (imv) {
    out.imovel = imv[1].trim();
    const l = /LOTE\s+([0-9]+[A-Za-z]*(?:-[A-Za-z]+)?)/i.exec(imv[1]);
    if (l) out.lote = l[1].toUpperCase();
    const g = /GLEBA\s+([0-9]+[A-Za-z]?)\b/i.exec(imv[1]);
    if (g) out.gleba = g[1].toUpperCase();
    const ng = /GLEBA\s+(?!\d)([A-ZÀ-Ú][A-ZÀ-Ú ]+?)\s*$/i.exec(imv[1]);
    if (ng) out.nomeGleba = ng[1].trim();
  }
  const mun = /Munic[íi]pio:\s*(.+?)\s+U\.?F:?\s*([A-Z]{2})/i.exec(t);
  if (mun) { out.municipio = mun[1].trim(); out.uf = mun[2]; }
  const ar = /[ÁA]rea\s*\(ha\):\s*([\d.,]+)/i.exec(t);
  if (ar) out.areaHa = num(ar[1]);
  else {
    // lote urbano: área em metros quadrados
    const am = /[ÁA]rea\s*\(m[²2]\):\s*([\d.,]+)/i.exec(t);
    if (am) out.areaHa = num(am[1]) / 10_000;
  }
  const pe = /Per[íi]metro\s*\(m\):\s*([\d.,]+)/i.exec(t);
  if (pe) out.perimetroM = num(pe[1]);

  // Início
  const ini = new RegExp(`Inicia-se[^.]*?\\b(?:ponto|v[ée]rtice|marco)\\s+${ID}`, 'i').exec(t);
  if (ini) out.inicio = limpaId(ini[1]);

  // Segmentos: "[confrontando com X,] com azimute de A por uma distância de D m, até o ponto ID"
  const re = new RegExp(
    `(?:segue\\s+confrontando\\s+(?:com\\s+)?(?:[oa]s?\\s+)?([^,;]{1,120}?),?\\s+)?(?:com\\s+)?(azimute|rumo)\\s+(?:de\\s+)?(?:(${ANG_RUMO})|(${ANG_AZ}))\\s*,?\\s*por\\s+uma\\s+dist[âa]ncia\\s+de\\s+(\\d[\\d.,]*?)\\s*(?:m(?:etros)?\\b)?[^,;\\d]*?,?\\s*at[ée]\\s+(?:o\\s+)?(?:ponto|v[ée]rtice|marco)\\s+${ID}`,
    'gi',
  );
  let cur = out.inicio ?? '';
  let m: RegExpExecArray | null;
  const fim = t.search(/onde\s+teve\s+in[íi]cio/i);
  const corpo = fim > 0 ? t.slice(0, fim + 40) : t;
  while ((m = re.exec(corpo))) {
    const tipo = m[2].toLowerCase() as 'azimute' | 'rumo';
    let az: number; let txt: string;
    if (m[3]) { // rumo
      az = rumoToAzimute(m[4], dmsToDeg(m[5], m[6], m[7]), m[8]);
      txt = m[3].trim();
    } else {
      az = dmsToDeg(m[10], m[11], m[12]);
      txt = m[9].trim();
    }
    const dist = num(m[13]);
    const para = limpaId(m[14]);
    if (az >= 360 || !isFinite(dist) || dist <= 0) avisos.push(`Segmento ${cur}→${para}: valor suspeito (${txt}, ${m[13]} m)`);
    out.segmentos.push({ de: cur, para, azimute: norm360(az), azimuteTexto: txt, tipo, distancia: dist, confrontante: m[1]?.trim() });
    cur = para;
  }

  // Coordenadas geográficas por vértice: "vértice M - 07, de coordenadas de Lat: -11º40'49.537'' e Long: -62º42'36.440''"
  const GEO = `(-?)\\s*(\\d{1,3})\\s*[°º˚]\\s*(\\d{1,2})\\s*['′’´]\\s*(\\d{1,2}(?:[.,]\\d+)?)`;
  const reCoord = new RegExp(`(?:ponto|v[ée]rtice|marco)\\s+${ID}\\s*,?\\s*de\\s+coordenadas?\\s+(?:de\\s+)?Lat(?:itude)?\\.?\\s*:?\\s*${GEO}[^A-Za-z\\d-]*(?:e\\s+)?Long(?:itude)?\\.?\\s*:?\\s*${GEO}`, 'gi');
  let c: RegExpExecArray | null;
  while ((c = reCoord.exec(corpo))) {
    const grau = (sinal: string, d: string, mi: string, se: string) => (sinal === '-' ? -1 : 1) * (Number(d) + Number(mi) / 60 + parseFloat(se.replace(',', '.')) / 3600);
    const lat = grau(c[2], c[3], c[4], c[5]), lon = grau(c[6], c[7], c[8], c[9]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && Number(c[4]) < 60 && Number(c[8]) < 60) (out.coordenadas ??= {})[limpaId(c[1])] ??= { lat, lon };
  }

  if (!out.segmentos.length) avisos.push('Nenhum segmento reconhecido: usar leitura por IA ou digitação manual.');
  else {
    if (out.inicio && cur !== out.inicio) avisos.push(`A descrição não volta ao ponto inicial (${out.inicio}); último ponto: ${cur}.`);
    const nPalavras = (corpo.match(/\b(azimute|rumo)\b/gi) || []).length;
    if (nPalavras !== out.segmentos.length) avisos.push(`Foram vistas ${nPalavras} menções a azimute/rumo mas lidos ${out.segmentos.length} segmentos: conferir a tabela.`);
  }
  if (!out.inicio) avisos.push('Ponto inicial não identificado.');
  return out;
}
