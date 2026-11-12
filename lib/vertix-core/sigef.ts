// SIGEF (parcelas certificadas pelo INCRA) como FILTRO DE PRECISÃO sobre a âncora do SIGLO.
// SIGLO acha o lote (forma simplificada, ±1–2 m); o SIGEF traz geometria certificada
// (muitos vértices, precisão de centímetros) das parcelas vizinhas ou da própria parcela.
// Aqui comparamos o memorial já posicionado com essas parcelas: se casar, a âncora é
// confirmada e ajustada; se não houver SIGEF na área, nada muda (cai no SIGLO).
// PRIVACIDADE: o pedido já limita as colunas; só id, código, situação, nome da área e geometria são lidos.
// Nada disso é gravado no banco: a consulta é ao vivo e descartada.
import { Anel, aneilParaUtm } from './fundiario';
import { Candidata } from './ancora';
import { Vertice } from './poligonal';

export const WFS_SIGEF = 'https://geoportal.sedam.ro.gov.br/geoserver/ows';
export const CAMADAS_SIGEF = ['incra:sigef_privado_ro', 'incra:sigef_publico_ro'];

export interface Bbox { minLon: number; minLat: number; maxLon: number; maxLat: number }
export interface ParcelaSigef { camada: string; id?: string; codigo?: string; situacao?: string; nomeArea?: string; aneis: Anel[] }

/** Caixa que envolve o lote do SIGLO, com folga (m) para pegar as parcelas vizinhas. */
export function bboxDoLote(aneis: Anel[], folgaM = 300): Bbox {
  const pts = aneis.flat();
  const lats = pts.map(p => p[1]), lons = pts.map(p => p[0]);
  const dLat = folgaM / 111_000, dLon = folgaM / (111_000 * Math.cos((lats[0] * Math.PI) / 180));
  return { minLon: Math.min(...lons) - dLon, maxLon: Math.max(...lons) + dLon, minLat: Math.min(...lats) - dLat, maxLat: Math.max(...lats) + dLat };
}

/** WFS 1.0.0 de propósito: o parâmetro bbox vem em ordem lon,lat e dispensa saber o nome da coluna de geometria. */
export function urlSigef(camada: string, b: Bbox, max = 300): string {
  const p = new URLSearchParams({
    service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: camada,
    outputFormat: 'application/json', srsName: 'EPSG:4674', maxFeatures: String(max),
    bbox: `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat},EPSG:4674`,
    // colunas reais da camada (conferidas em DescribeFeatureType). Ficam de fora rt, art e registro_*:
    propertyName: 'geometry,codigo_imo,situacao_i,status,nome_area,municipio_nome',
  });
  return `${WFS_SIGEF}?${p}`;
}

function aneisDe(g: any): Anel[] {
  if (!g) return [];
  const dois = (anel: number[][]): Anel => anel.map(p => [p[0], p[1]] as [number, number]); // o servidor manda lon,lat,altitude
  if (g.type === 'Polygon') return [dois(g.coordinates[0])];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p: any) => dois(p[0]));
  return [];
}
const achar = (p: Record<string, unknown>, re: RegExp) => { const k = Object.keys(p).find(k => re.test(k)); return k ? p[k] : undefined; };

export async function buscarParcelasSigef(b: Bbox, opt: { timeoutMs?: number; fetchImpl?: typeof fetch; camadas?: string[] } = {}) {
  const f = opt.fetchImpl ?? fetch;
  const camadas = opt.camadas ?? CAMADAS_SIGEF;
  const um = async (camada: string) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opt.timeoutMs ?? 10_000);
    try {
      const r = await f(urlSigef(camada, b), { signal: ctl.signal });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 160)}`);
      const js = JSON.parse(txt);
      if (!Array.isArray(js.features)) throw new Error('sem "features"');
      const out: ParcelaSigef[] = [];
      for (const ft of js.features) {
        const aneis = aneisDe(ft.geometry); if (!aneis.length) continue;
        const p = ft.properties ?? {};
        const situacao = (achar(p, /^status$/i) ?? achar(p, /^situac/i)) as string | undefined;
        if (situacao && /CANCEL/i.test(situacao)) continue;   // certificação cancelada não vale como referência
        out.push({
          camada, id: ft.id, aneis,
          codigo: achar(p, /^codigo/i) as string | undefined,
          situacao,
          nomeArea: achar(p, /^nome_area$/i) as string | undefined,   // ex.: "LOTE 141, GLEBA 02-A, PA ..." (só para exibir/casar; não é gravado)
        });
      }
      return { camada, ok: true as const, parcelas: out };
    } catch (e: any) {
      return { camada, ok: false as const, erro: e?.name === 'AbortError' ? 'tempo esgotado' : String(e?.message ?? e), parcelas: [] as ParcelaSigef[] };
    } finally { clearTimeout(t); }
  };
  const rs = await Promise.all(camadas.map(um));
  return {
    ok: rs.some(r => r.ok),                       // basta uma camada responder
    parcelas: rs.flatMap(r => r.parcelas),
    falhas: rs.filter(r => !r.ok).map(r => `${r.camada}: ${(r as any).erro}`),
  };
}

// ---------- comparação com o memorial já posicionado ----------
export interface AjusteSigef {
  nivel: 'confirmada' | 'divisa' | 'nenhum';
  parcela?: ParcelaSigef;
  verticesCasados: number;        // vértices do memorial a <= tol de um vértice certificado
  verticesNaDivisa: number;       // vértices do memorial a <= tol da divisa certificada
  residuoM: number;               // distância média (m) aos vértices certificados casados
  deslocamento?: { dE: number; dN: number };   // translação sugerida para encostar no SIGEF
}

type P = [number, number];
const dSeg = (p: P, a: P, b: P) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const dBorda = (p: P, r: P[]) => Math.min(...r.map((_, i) => dSeg(p, r[i], r[(i + 1) % r.length])));

export function avaliarContraSigef(vs: Vertice[], parcelas: ParcelaSigef[], fuso: number, tolDivisa = 1.5, busca = 3): AjusteSigef {
  let melhor: AjusteSigef = { nivel: 'nenhum', verticesCasados: 0, verticesNaDivisa: 0, residuoM: Infinity };
  const pts = vs.map(v => [v.x, v.y] as P);
  for (const parcela of parcelas) for (const anel of parcela.aneis) {
    const r = aneilParaUtm(anel, fuso);
    const pares: { d: number; dE: number; dN: number }[] = [];
    let naDivisa = 0;
    for (const p of pts) {
      let best = { d: Infinity, dE: 0, dN: 0 };
      for (const q of r) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < best.d) best = { d, dE: q[0] - p[0], dN: q[1] - p[1] }; }
      if (best.d <= busca) pares.push(best);
      if (dBorda(p, r) <= tolDivisa) naDivisa++; // o SIGLO erra 1–2 m, então a divisa precisa de folga maior que a do vértice
    }
    const casados = pares.filter(x => x.d <= 0.5).length;
    const media = (k: 'dE' | 'dN') => pares.reduce((s, x) => s + x[k], 0) / (pares.length || 1);
    const nivel: AjusteSigef['nivel'] = pares.length >= Math.ceil(pts.length * 0.8) ? 'confirmada' : naDivisa >= 2 ? 'divisa' : 'nenhum';
    const cand: AjusteSigef = {
      nivel, parcela, verticesCasados: casados, verticesNaDivisa: naDivisa,
      residuoM: pares.length ? pares.reduce((s, x) => s + x.d, 0) / pares.length : Infinity,
      deslocamento: nivel === 'confirmada' ? { dE: media('dE'), dN: media('dN') } : undefined,
    };
    const peso = (a: AjusteSigef) => (a.nivel === 'confirmada' ? 1000 : a.nivel === 'divisa' ? 100 : 0) + a.verticesNaDivisa * 10 + a.verticesCasados - (isFinite(a.residuoM) ? a.residuoM / 100 : 0);
    if (peso(cand) > peso(melhor)) melhor = cand;
  }
  return melhor;
}

export interface CandidataRefinada extends Candidata {
  sigef: AjusteSigef;
  confianca: 'sigef_confirmada' | 'sigef_divisa' | 'siglo';
  pontuacaoFinal: number;
}

/** Reordena as candidatas do SIGLO usando o SIGEF. Sem parcelas SIGEF, devolve na mesma ordem (confiança "siglo"). */
export function refinarCandidatas(cands: Candidata[], parcelas: ParcelaSigef[], fuso: number, tolDivisa = 1.5): CandidataRefinada[] {
  return cands.map(c => {
    const sigef = parcelas.length ? avaliarContraSigef(c.vertices, parcelas, fuso, tolDivisa) : { nivel: 'nenhum' as const, verticesCasados: 0, verticesNaDivisa: 0, residuoM: Infinity };
    const bonus = sigef.nivel === 'confirmada' ? 100 : sigef.nivel === 'divisa' ? 30 : 0;
    return { ...c, sigef, confianca: sigef.nivel === 'confirmada' ? 'sigef_confirmada' as const : sigef.nivel === 'divisa' ? 'sigef_divisa' as const : 'siglo' as const, pontuacaoFinal: c.pontuacao + bonus };
  }).sort((a, b) => b.pontuacaoFinal - a.pontuacaoFinal);
}

/** Posição final: a candidata + o deslocamento do SIGEF (só quando confirmada). */
export function posicaoFinal(c: CandidataRefinada): Vertice[] {
  const d = c.sigef.deslocamento;
  return d ? c.vertices.map(v => ({ ...v, x: v.x + d.dE, y: v.y + d.dN })) : c.vertices;
}
