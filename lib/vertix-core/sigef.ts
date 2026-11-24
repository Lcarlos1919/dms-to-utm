// Filtro SIGEF sobre o lote do SIGLO (coador): o SIGEF traz as parcelas privadas certificadas,
// com geometria georreferenciada. Um lote do SIGLO que coincide com uma parcela certificada
// é confirmado; um que a corta de forma parcial é conflito e perde a preferência.
// O SIGEF não tem número de lote nem de gleba: o casamento é só espacial.
// Campos do schema incra:sigef_privado_ro (XSD). Nenhum campo de proprietário é pedido.
import { WFS_URL, type Anel } from './fundiario';

export const SIGEF_CAMADA = 'incra:sigef_privado_ro';
export const SIGEF_CAMPOS = ['geometry', 'codigo_imo', 'nome_area', 'registro_m', 'municipio_nome', 'status'] as const;

export interface ParcelaSigef {
  codigoImo?: string;
  nomeArea?: string;
  registroM?: string;
  municipio?: string;
  status?: string;
  aneis: Anel[];
}

export type SituacaoSigef = 'coincide' | 'conflito' | 'sem_sobreposicao' | 'indisponivel';

export interface ClassificacaoSigef {
  situacao: SituacaoSigef;
  /** fração do lote do SIGLO coberta pela parcela do SIGEF (0 a 1) */
  fracaoLote: number;
  /** fração da parcela do SIGEF coberta pelo lote do SIGLO (0 a 1) */
  fracaoParcela: number;
  parcela?: ParcelaSigef;
}

// ---------- geometria (lon/lat, EPSG:4674) ----------
export function pontoNoAnel(p: [number, number], anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const dentroDeAneis = (p: [number, number], aneis: Anel[]) => aneis.some((a) => pontoNoAnel(p, a));

/** Caixa envolvente de um conjunto de anéis: [minLon, minLat, maxLon, maxLat]. */
export function caixa(aneis: Anel[]): [number, number, number, number] {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const anel of aneis) for (const [x, y] of anel) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

/**
 * Fração de cada polígono coberta pelo outro, estimada por grade de pontos.
 * Funciona com parcelas não convexas e com partes múltiplas.
 */
export function sobreposicao(lote: Anel[], parcela: Anel[], passos = 60): { fracaoLote: number; fracaoParcela: number } {
  const [a, b, c, d] = caixa([...lote, ...parcela]);
  const dx = (c - a) / passos, dy = (d - b) / passos;
  let noLote = 0, naParcela = 0, nos2 = 0;
  for (let i = 0; i < passos; i++) for (let j = 0; j < passos; j++) {
    const p: [number, number] = [a + (i + 0.5) * dx, b + (j + 0.5) * dy];
    const l = dentroDeAneis(p, lote), q = dentroDeAneis(p, parcela);
    if (l) noLote++;
    if (q) naParcela++;
    if (l && q) nos2++;
  }
  return {
    fracaoLote: noLote ? nos2 / noLote : 0,
    fracaoParcela: naParcela ? nos2 / naParcela : 0,
  };
}

/** Classifica o lote do SIGLO frente às parcelas do SIGEF que ele toca. */
export function classificarPeloSigef(aneisLote: Anel[], parcelas: ParcelaSigef[]): ClassificacaoSigef {
  let melhor: ClassificacaoSigef = { situacao: 'sem_sobreposicao', fracaoLote: 0, fracaoParcela: 0 };
  let piorConflito: ClassificacaoSigef | null = null;
  for (const parcela of parcelas) {
    if (!parcela.aneis.length) continue;
    const s = sobreposicao(aneisLote, parcela.aneis);
    if (s.fracaoLote === 0) continue;
    if (s.fracaoLote >= 0.9 && s.fracaoParcela >= 0.9) {
      return { situacao: 'coincide', fracaoLote: s.fracaoLote, fracaoParcela: s.fracaoParcela, parcela };
    }
    if (s.fracaoLote >= 0.2 || s.fracaoParcela >= 0.2) {
      const c: ClassificacaoSigef = { situacao: 'conflito', ...s, parcela };
      if (!piorConflito || s.fracaoLote > piorConflito.fracaoLote) piorConflito = c;
    }
  }
  if (piorConflito) melhor = piorConflito;
  return melhor;
}

// ---------- consulta ao WFS ----------
export function urlSigefCaixa(aneis: Anel[], max = 200): string {
  const [a, b, c, d] = caixa(aneis);
  const p = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: SIGEF_CAMADA,
    outputFormat: 'application/json', srsName: 'EPSG:4674', count: String(max),
    propertyName: SIGEF_CAMPOS.join(','),
    cql_filter: `BBOX(geometry,${a},${b},${c},${d})`,
  });
  return `${WFS_URL}?${p}`;
}

const polyAneis = (g: { type: string; coordinates: any }): Anel[] => {
  if (g.type === 'Polygon') return [g.coordinates[0]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p: any) => p[0]);
  return [];
};

export type ResultadoSigef = { ok: true; parcelas: ParcelaSigef[] } | { ok: false; erro: string };

export async function buscarSigef(
  aneis: Anel[],
  opt: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoSigef> {
  const f = opt.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opt.timeoutMs ?? 8000);
  try {
    const r = await f(urlSigefCaixa(aneis), { signal: ctl.signal, headers: { Accept: 'application/json' } });
    const txt = await r.text();
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status}: ${txt.slice(0, 160)}` };
    let js: any;
    try { js = JSON.parse(txt); } catch { return { ok: false, erro: 'SIGEF não devolveu JSON.' }; }
    if (!Array.isArray(js.features)) return { ok: false, erro: 'SIGEF sem "features".' };
    const parcelas: ParcelaSigef[] = [];
    for (const ft of js.features) {
      if (!ft.geometry) continue;
      const p = ft.properties ?? {};
      parcelas.push({
        codigoImo: p.codigo_imo ?? undefined,
        nomeArea: p.nome_area ?? undefined,
        registroM: p.registro_m ?? undefined,
        municipio: p.municipio_nome ?? undefined,
        status: p.status ?? undefined,
        aneis: polyAneis(ft.geometry),
      });
    }
    return { ok: true, parcelas };
  } catch (e: any) {
    return { ok: false, erro: e?.name === 'AbortError' ? 'SIGEF demorou demais (tempo esgotado).' : String(e) };
  } finally { clearTimeout(timer); }
}

/**
 * Coador: entre os candidatos do SIGLO, mantém os que não conflitam com o SIGEF.
 * Um candidato que coincide com parcela certificada vem antes; um em conflito fica por último.
 */
export function ordenarPeloSigef<T extends { aneis: Anel[] }>(
  candidatos: T[],
  parcelas: ParcelaSigef[],
): { ordem: (T & { sigef: ClassificacaoSigef })[]; avisos: string[] } {
  const peso: Record<SituacaoSigef, number> = { coincide: 0, sem_sobreposicao: 1, indisponivel: 1, conflito: 2 };
  const ordem = candidatos
    .map((c) => ({ ...c, sigef: classificarPeloSigef(c.aneis, parcelas) }))
    .sort((x, y) => peso[x.sigef.situacao] - peso[y.sigef.situacao]);
  const avisos: string[] = [];
  const conflitos = ordem.filter((c) => c.sigef.situacao === 'conflito').length;
  if (conflitos) avisos.push(`${conflitos} candidato(s) do SIGLO cortam parcela certificada no SIGEF e perderam a preferência.`);
  return { ordem, avisos };
}
