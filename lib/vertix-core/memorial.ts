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
  avisos: string[];
}

const ID = '([A-Za-z]{1,4}\\s?-?\\s?\\d{1,4}[A-Za-z]?(?:-\\d+)?)';
const limpaId = (s: string) => s.replace(/\s+/g, '').toUpperCase();
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
  const pe = /Per[íi]metro\s*\(m\):\s*([\d.,]+)/i.exec(t);
  if (pe) out.perimetroM = num(pe[1]);

  // Início
  const ini = new RegExp(`Inicia-se[^.]*?\\b(?:ponto|v[ée]rtice|marco)\\s+${ID}`, 'i').exec(t);
  if (ini) out.inicio = limpaId(ini[1]);

  // Segmentos: "[confrontando com X,] com azimute de A por uma distância de D m, até o ponto ID"
  const re = new RegExp(
    `(?:segue\\s+confrontando\\s+com\\s+(.+?),\\s*)?(?:com\\s+)?(azimute|rumo)\\s+(?:de\\s+)?(?:(${ANG_RUMO})|(${ANG_AZ}))\\s*,?\\s*por\\s+uma\\s+dist[âa]ncia\\s+de\\s+([\\d.,]+)\\s*m(?:etros)?\\b[^,]*?,?\\s*at[ée]\\s+(?:o\\s+)?(?:ponto|v[ée]rtice|marco)\\s+${ID}`,
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

  // Outros formatos (ordem invertida, tabela De/Para): usados quando o padrão principal falha.
  if (!encadeado(out.segmentos, out.inicio)) {
    const alt = melhorAlternativa(corpo, out.inicio);
    if (alt && alt.length > out.segmentos.length) {
      out.segmentos = alt;
      cur = alt[alt.length - 1].para;
      if (!out.inicio) out.inicio = alt[0].de;
      avisos.push('Memorial lido por um formato alternativo: confira a tabela.');
    }
  }

  if (!out.segmentos.length) avisos.push('Nenhum segmento reconhecido: preencha a tabela manualmente.');
  else {
    if (out.inicio && cur !== out.inicio) avisos.push(`A descrição não volta ao ponto inicial (${out.inicio}); último ponto: ${cur}.`);
    const nPalavras = (corpo.match(/\b(azimute|rumo)\b/gi) || []).length;
    if (nPalavras > 0 && nPalavras !== out.segmentos.length) avisos.push(`Foram vistas ${nPalavras} menções a azimute/rumo mas lidos ${out.segmentos.length} segmentos: conferir a tabela.`);
  }
  if (!out.inicio) avisos.push('Ponto inicial não identificado.');
  return out;
}

// ---------- formatos alternativos ----------
const ANG_QUALQUER = `(?:([NS])\\s*${DMS_SRC}\\s*([EWLO])|${DMS_SRC})`;
const DIST = '([\\d.]+(?:,\\d+)?|\\d+(?:\\.\\d+)?)\\s*m(?:etros)?\\b';
/** Trecho de até n caracteres que não atravessa o próximo "até o vértice". */
const GAP = (n: number) => `(?:(?!at[ée]\\s+(?:o\\s+|ao\\s+)?(?:ponto|v[ée]rtice|marco)\\b)[\\s\\S]){0,${n}}?`;

/** Converte os grupos de ANG_QUALQUER (a partir de `i`) em azimute. */
function anguloDeGrupos(m: RegExpExecArray, i: number): { az: number; tipo: 'azimute' | 'rumo'; txt: string } | undefined {
  if (m[i]) {
    const deg = dmsToDeg(m[i + 1], m[i + 2], m[i + 3]);
    if (deg > 90) return undefined;
    return { az: norm360(rumoToAzimute(m[i], deg, m[i + 4])), tipo: 'rumo', txt: `${m[i]} ${m[i + 1]}°${m[i + 2] ?? '00'}'${m[i + 3] ?? '00'}" ${m[i + 4]}` };
  }
  if (m[i + 5] === undefined) return undefined;
  const az = dmsToDeg(m[i + 5], m[i + 6], m[i + 7]);
  if (az >= 360) return undefined;
  return { az, tipo: 'azimute', txt: `${m[i + 5]}°${m[i + 6] ?? '00'}'${m[i + 7] ?? '00'}"` };
}

function encadeado(segs: Segmento[], inicio?: string): boolean {
  if (segs.length < 3) return false;
  for (let i = 1; i < segs.length; i++) if (segs[i].de !== segs[i - 1].para) return false;
  const ini = inicio ?? segs[0].de;
  return segs[segs.length - 1].para === ini;
}

/** "... até o vértice P2, com azimute de 92°33'41" e distância de 125,45 m ..." (ângulo DEPOIS do destino). */
function lerDestinoAntes(t: string, inicio?: string): Segmento[] {
  const re = new RegExp(
    `at[ée]\\s+(?:o\\s+|ao\\s+)?(?:ponto|v[ée]rtice|marco)\\s+${ID}${GAP(220)}(azimute|rumo|az\\.?)\\s*(?:de\\s+|plano\\s+de\\s+|=\\s*)?${ANG_QUALQUER}${GAP(80)}dist[âa]ncia\\s*(?:de\\s+|=\\s*)?${DIST}`,
    'gi',
  );
  const segs: Segmento[] = [];
  let cur = inicio ?? '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const ang = anguloDeGrupos(m, 3);
    const dist = num(m[11]);
    if (!ang || !(dist > 0)) continue;
    // Neste formato o ângulo/distância descrevem o lado que CHEGA ao destino citado.
    const para = limpaId(m[1]);
    segs.push({ de: cur, para, azimute: ang.az, azimuteTexto: ang.txt, tipo: ang.tipo, distancia: dist });
    cur = para;
  }
  if (segs.length && !segs[0].de) segs[0].de = segs[segs.length - 1].para;
  return segs;
}

/** "com azimute de X e distância de Y m, chega-se ao vértice P2" e variações sem "até o". */
function lerAnguloAntes(t: string, inicio?: string): Segmento[] {
  const re = new RegExp(
    `(azimute|rumo|az\\.?)\\s*(?:de\\s+|plano\\s+de\\s+|=\\s*)?${ANG_QUALQUER}${GAP(80)}(?:dist[âa]ncia\\s*(?:de\\s+|=\\s*)?)?${DIST}[\\s\\S]{0,80}?(?:ponto|v[ée]rtice|marco)\\s+${ID}`,
    'gi',
  );
  const segs: Segmento[] = [];
  let cur = inicio ?? '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const ang = anguloDeGrupos(m, 2);
    const dist = num(m[10]);
    if (!ang || !(dist > 0)) continue;
    const para = limpaId(m[11]);
    segs.push({ de: cur, para, azimute: ang.az, azimuteTexto: ang.txt, tipo: ang.tipo, distancia: dist });
    cur = para;
  }
  if (segs.length && !segs[0].de) segs[0].de = segs[segs.length - 1].para;
  return segs;
}

/** Tabela "De Para Azimute Distância" (ex.: "P1 P2 92°33'41,91" 125,45"). */
function lerTabela(t: string): Segmento[] {
  const re = new RegExp(`${ID}\\s+(?:a\\s+|-\\s*|→\\s*)?${ID}\\s+${ANG_QUALQUER}\\s+([\\d.]+,\\d+|\\d+\\.\\d+|\\d+)\\s*(?:m\\b)?`, 'gi');
  const segs: Segmento[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const ang = anguloDeGrupos(m, 3);
    const dist = num(m[11]);
    if (!ang || !(dist > 0)) continue;
    segs.push({ de: limpaId(m[1]), para: limpaId(m[2]), azimute: ang.az, azimuteTexto: ang.txt, tipo: ang.tipo, distancia: dist });
  }
  return segs;
}

/** Maior trecho encadeado (cada "de" é o "para" anterior) de uma lista de segmentos. */
function maiorCadeia(segs: Segmento[]): Segmento[] {
  let melhor: Segmento[] = [];
  let atual: Segmento[] = [];
  for (const s of segs) {
    if (atual.length && s.de !== atual[atual.length - 1].para) {
      if (atual.length > melhor.length) melhor = atual;
      atual = [];
    }
    atual.push(s);
    if (atual.length > 1 && s.para === atual[0].de) { // fechou: guarda e recomeça
      if (atual.length > melhor.length) melhor = atual;
      atual = [];
    }
  }
  return atual.length > melhor.length ? atual : melhor;
}

function melhorAlternativa(t: string, inicio?: string): Segmento[] | undefined {
  const opcoes = [lerDestinoAntes(t, inicio), lerAnguloAntes(t, inicio), maiorCadeia(lerTabela(t))];
  const pont = (s: Segmento[]) => s.length + (encadeado(s, inicio) ? 1000 : 0);
  const melhor = opcoes.sort((a, b) => pont(b) - pont(a))[0];
  return melhor.length >= 3 ? melhor : undefined;
}

// ---------- coordenada do ponto inicial ----------
export interface CoordenadaLida {
  vertice?: string;
  este?: number; norte?: number;      // UTM
  lon?: number; lat?: number;         // geográficas (graus decimais, negativos a S/W)
  fuso?: number;                      // declarado (fuso ou meridiano central)
  hemisferio?: 'S' | 'N';
  datum?: 'SIRGAS 2000' | 'WGS 84' | 'SAD69' | 'Córrego Alegre';
}

const NUM_COORD = '(\\d{1,2}(?:[.\\s]?\\d{3}){2}(?:[,.]\\d+)?|\\d{3}[.\\s]?\\d{3}(?:[,.]\\d+)?|\\d{6,8}(?:[,.]\\d+)?)';
const numCoord = (s: string) => {
  const limpo = s.replace(/\s/g, '');
  // "8.876.543,21" / "512.345,67" (pt-BR) ou "8876543.21" (ponto decimal)
  if (/,\d+$/.test(limpo)) return Number(limpo.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ''));
  return Number(limpo);
};

function sem(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

/**
 * Procura, no texto do memorial, a coordenada de um vértice (de preferência o inicial):
 * UTM ("N 8.876.543,21 m e E 512.345,67 m", "E=512345,67; N=8876543,21", "X/Y")
 * ou geográfica ("latitude 10°12'13,4" S e longitude 62°40'12,3" W").
 * Também lê fuso (ou meridiano central), hemisfério e datum declarados.
 */
export function lerCoordenadaInicial(textoBruto: string, inicio?: string): CoordenadaLida | undefined {
  const t = normalizaTexto(textoBruto);
  const T = sem(t);
  const out: CoordenadaLida = {};

  const datum = /SIRGAS\s*-?\s*2000/.test(T) ? 'SIRGAS 2000' : /SAD\s*-?\s*69/.test(T) ? 'SAD69' : /WGS\s*-?\s*84/.test(T) ? 'WGS 84' : /CORREGO\s+ALEGRE/.test(T) ? 'Córrego Alegre' : undefined;
  if (datum) out.datum = datum;
  const fuso = /\b(?:FUSO|ZONA|ZONE)\s*(?:UTM\s*)?[:=]?\s*(\d{1,2})\s*([NS]|SUL|NORTE)?\b/.exec(T) ?? /\bUTM\s*[:=]?\s*(\d{1,2})\s*([NS]|SUL|NORTE)?\b/.exec(T);
  if (fuso && Number(fuso[1]) >= 1 && Number(fuso[1]) <= 60) {
    out.fuso = Number(fuso[1]);
    if (fuso[2]) out.hemisferio = /^S/.test(fuso[2]) ? 'S' : 'N';
  } else {
    const mc = /MERIDIANO\s+CENTRAL\s*(?:\(?\s*MC\s*\)?)?\s*[:=]?\s*(-?\d{2,3})\s*°?\s*(W|O|WGR|OESTE)?/.exec(T) ?? /\bM\.?\s?C\.?\s*[:=]?\s*(-?\d{2,3})\s*°?\s*(W|O|WGR|OESTE)?/.exec(T);
    if (mc) {
      let lon = Number(mc[1]);
      if (lon > 0 && (mc[2] || lon <= 75)) lon = -lon; // Brasil: oeste
      const f = Math.round((lon + 183) / 6);
      if (f >= 1 && f <= 60 && Math.abs(-183 + 6 * f - lon) < 0.01) out.fuso = f;
    }
  }

  // Janela de busca: a partir do vértice inicial citado, senão do "Inicia-se", senão o texto todo.
  let ini = 0;
  if (inicio) {
    const idx = T.search(new RegExp(`\\b${inicio.replace(/[-]/g, '\\s?-?\\s?')}\\b`));
    if (idx >= 0) ini = idx;
  }
  const inicia = T.search(/INICIA-SE|INICIO\s+(?:DA|DESTA)\s+DESCRICAO|TEM\s+INICIO/);
  if (inicia >= 0 && (ini === 0 || inicia < ini)) ini = inicia;
  const janela = T.slice(ini, ini + 600);
  const janelaOrig = t.slice(ini, ini + 600);

  const rotN = '(?:\\bN|NORTE|\\bY|COORDENADA\\s+N)';
  const rotE = '(?:\\bE|ESTE|LESTE|\\bX|COORDENADA\\s+E)';
  const reN = new RegExp(`${rotN}\\s*[:=]?\\s*${NUM_COORD}\\s*M?`);
  const reE = new RegExp(`${rotE}\\s*[:=]?\\s*${NUM_COORD}\\s*M?`);
  const reN2 = new RegExp(`${NUM_COORD}\\s*M?\\s*${rotN}\\b`);
  const reE2 = new RegExp(`${NUM_COORD}\\s*M?\\s*${rotE}\\b`);
  const n = reN.exec(janela) ?? reN2.exec(janela);
  const e = reE.exec(janela) ?? reE2.exec(janela);
  if (n && e) {
    const N = numCoord(n[1]), E = numCoord(e[1]);
    if (E >= 100_000 && E <= 900_000 && N >= 0 && N <= 10_000_000) {
      out.este = E; out.norte = N;
      if (!out.hemisferio && N > 5_000_000) out.hemisferio = 'S';
    }
  }

  if (out.este === undefined) {
    const G = `(\\d{1,3})\\s*[°º]\\s*(\\d{1,2})\\s*['′’]\\s*(\\d{1,2}(?:[.,]\\d+)?)\\s*(?:["″”]|'')?`;
    const la = new RegExp(`LAT(?:ITUDE)?\\.?\\s*[:=]?\\s*(-)?\\s*${G}\\s*([NS])?`).exec(janela);
    const lo = new RegExp(`LONG(?:ITUDE)?\\.?\\s*[:=]?\\s*(-)?\\s*${G}\\s*([WOE])?`).exec(janela);
    if (la && lo) {
      const lat = dmsToDeg(la[2], la[3], la[4]) * (la[1] || la[5] === 'S' ? -1 : 1);
      const lon = dmsToDeg(lo[2], lo[3], lo[4]) * (lo[1] || lo[5] === 'W' || lo[5] === 'O' ? -1 : 1);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { out.lat = lat; out.lon = lon; }
    }
  }
  if (out.este === undefined && out.lon === undefined) return undefined;

  const vert = new RegExp(`(?:PONTO|V[EÉ]RTICE|MARCO)\\s+${ID}`, 'i').exec(janelaOrig);
  out.vertice = inicio ?? (vert ? limpaId(vert[1]) : undefined);
  return out;
}
