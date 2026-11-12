// Busca do lote em DUAS fontes e escolha da melhor:
//   "banco"     = tabela fundiario_lotes no Supabase (rápida, foto da base numa data)
//   "geoportal" = WFS da SEDAM ao vivo (sempre atual, pode estar fora do ar)
// Regra: se só uma responde, usa ela; se as duas respondem, vence a que casa melhor
// (lote, gleba, nome); em empate vence o geoportal (mais atual). Divergência vira aviso.
import { lonLatParaUtm } from './utm';

export const WFS_URL = 'https://geoportal.sedam.ro.gov.br/geoserver/ows';
export const WFS_CAMADA = 'incra:fundiaria_siglo_publico';

export interface Consulta { nomeGleba?: string; gleba?: string; lote: string }
export type Anel = [number, number][]; // lon, lat (EPSG:4674)
export interface LoteBase {
  fonte: 'banco' | 'geoportal';
  feicaoId?: string;
  nomeGleba: string; gleba: string; lote: string; setor?: string; nomeSetor?: string;
  areaOficialHa?: number;
  aneis: Anel[];                 // anel externo de cada parte do polígono
  baseData?: string;             // só no banco
  confere: { nome: boolean; gleba: boolean; lote: boolean };
}
export interface Resultado { ok: boolean; erro?: string; lotes: LoteBase[] }
export interface Escolha {
  escolhido?: LoteBase;
  fonte?: 'banco' | 'geoportal';
  motivo: string;
  avisos: string[];
  alternativas: LoteBase[];      // outros candidatos da fonte vencedora, para o usuário conferir
  divergenciaM?: number;
}

// ---------- texto ----------
export function repararTexto(s: unknown): string {
  if (typeof s === 'number') return String(s);
  if (typeof s !== 'string') return '';
  if (!/[ÃÂ]/.test(s)) return s;
  if ([...s].some(c => c.charCodeAt(0) > 255)) return s;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from([...s].map(c => c.charCodeAt(0))));
  } catch { return s; }
}
export const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const numeroInicial = (s: string) => /^\d+/.exec(s)?.[0];

function confere(q: Consulta, nome: string, gleba: string, lote: string) {
  const ql = normalizar(q.lote), l = normalizar(lote);
  return {
    nome: !q.nomeGleba || normalizar(nome).includes(normalizar(q.nomeGleba)),
    gleba: !q.gleba || normalizar(gleba) === normalizar(q.gleba),
    lote: l === ql || (!!numeroInicial(ql) && numeroInicial(ql) === numeroInicial(l)),
  };
}
const pontos = (c: LoteBase['confere']) => (c.lote ? 4 : 0) + (c.gleba ? 2 : 0) + (c.nome ? 1 : 0);

function aneisDeGeometria(g: { type: string; coordinates: any }): Anel[] {
  if (g.type === 'Polygon') return [g.coordinates[0]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p: any) => p[0]);
  return [];
}

// ---------- fonte 1: banco (Supabase, só no servidor, com a chave service_role) ----------
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;

export async function buscarNoBanco(rpc: Rpc, q: Consulta, limite = 10): Promise<Resultado> {
  // A função buscar_lote do banco exige um trecho do nome da gleba; sem ele não devolve nada.
  if (!q.nomeGleba?.trim()) return { ok: true, lotes: [] };
  try {
    const { data, error } = await rpc('buscar_lote', { p_nome: q.nomeGleba, p_gleba: q.gleba ?? null, p_lote: q.lote, p_limite: limite });
    if (error) return { ok: false, erro: error.message, lotes: [] };
    const lotes: LoteBase[] = [];
    for (const r of data ?? []) {
      const nome = repararTexto(r.nome_imovel), gleba = r.gleba ?? '', lote = r.lote ?? '';
      // Os "confere" do banco comparam o lote por texto inteiro ("139A-REM" ≠ "139");
      // aqui recalculamos com a mesma regra do GeoPortal (número inicial do lote).
      lotes.push({
        fonte: 'banco', feicaoId: r.source_id, nomeGleba: nome, gleba, lote,
        setor: r.setor ?? undefined, nomeSetor: repararTexto(r.nome_setor) || undefined,
        areaOficialHa: r.area_ha_oficial == null ? undefined : Number(r.area_ha_oficial),
        aneis: aneisDeGeometria(r.geom), baseData: r.base_date ?? undefined,
        confere: confere(q, nome, gleba, lote),
      });
    }
    lotes.sort((x, y) => pontos(y.confere) - pontos(x.confere));
    return { ok: true, lotes };
  } catch (e) { return { ok: false, erro: String(e), lotes: [] }; }
}

// ---------- fonte 2: GeoPortal ao vivo (WFS) ----------
const aspas = (s: string) => s.replace(/'/g, "''");

export function urlWfs(q: Consulta, max = 300): string {
  // O servidor só filtra por lote e gleba: o nome vem com acentos quebrados (PRINCÃ\x8dPIO),
  // então o nome é conferido aqui, depois de reparar o texto.
  const num = numeroInicial(normalizar(q.lote));
  const filtros = [`nome_do_lo LIKE '${aspas(num ?? normalizar(q.lote))}%'`];
  if (q.gleba) filtros.push(`gleba ILIKE '${aspas(q.gleba.trim())}'`);
  const p = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: WFS_CAMADA,
    outputFormat: 'application/json', srsName: 'EPSG:4674', count: String(max),
    propertyName: 'nome_do_lo,gleba,nome_do_im,setor,nome_setor,adequacao_,geom',
    cql_filter: filtros.join(' AND '),
  });
  return `${WFS_URL}?${p}`;
}

export async function buscarNoGeoportal(q: Consulta, opt: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<Resultado> {
  const f = opt.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opt.timeoutMs ?? 8000);
  try {
    const r = await f(urlWfs(q), { signal: ctl.signal, headers: { Accept: 'application/json' } });
    const txt = await r.text();
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status}: ${txt.slice(0, 200)}`, lotes: [] };
    let js: any;
    try { js = JSON.parse(txt); } catch { return { ok: false, erro: 'Resposta do geoportal não é JSON (provável erro do servidor).', lotes: [] }; }
    if (!Array.isArray(js.features)) return { ok: false, erro: 'Resposta do geoportal sem "features".', lotes: [] };
    const lotes: LoteBase[] = [];
    for (const ft of js.features) {
      const p = ft.properties ?? {};
      if (!ft.geometry) continue;
      const nome = repararTexto(p.nome_do_im), gleba = repararTexto(p.gleba), lote = repararTexto(p.nome_do_lo);
      const c = confere(q, nome, gleba, lote);
      if (!c.lote || !c.nome) continue; // o filtro do servidor foi largo de propósito
      lotes.push({
        fonte: 'geoportal', feicaoId: ft.id, nomeGleba: nome, gleba, lote,
        setor: repararTexto(p.setor) || undefined, nomeSetor: repararTexto(p.nome_setor) || undefined,
        areaOficialHa: p.adequacao_ == null ? undefined : Number(String(p.adequacao_).replace(',', '.')),
        aneis: aneisDeGeometria(ft.geometry), confere: c,
      });
    }
    lotes.sort((a, b) => pontos(b.confere) - pontos(a.confere));
    return { ok: true, lotes };
  } catch (e: any) {
    return { ok: false, erro: e?.name === 'AbortError' ? 'Geoportal demorou demais (tempo esgotado).' : String(e), lotes: [] };
  } finally { clearTimeout(timer); }
}

// ---------- comparação e escolha ----------
const fusoDe = (lon: number) => Math.floor((lon + 180) / 6) + 1;

/** Maior distância (m) entre um vértice de um anel e o vértice mais próximo do outro, nos dois sentidos. */
export function distanciaEntreAneis(a: Anel, b: Anel): number {
  if (!a?.length || !b?.length) return Infinity;
  const fuso = fusoDe(a[0][0]);
  const A = a.map(([lo, la]) => lonLatParaUtm(lo, la, fuso)), B = b.map(([lo, la]) => lonLatParaUtm(lo, la, fuso));
  const lado = (X: typeof A, Y: typeof A) => Math.max(...X.map(p => Math.min(...Y.map(q => Math.hypot(p.E - q.E, p.N - q.N)))));
  return Math.max(lado(A, B), lado(B, A));
}

export function escolherFonte(banco: Resultado, vivo: Resultado, preferencia: 'auto' | 'banco' | 'geoportal' = 'auto', toleranciaM = 1): Escolha {
  const avisos: string[] = [];
  const melhor = (r: Resultado) => r.lotes[0];
  const pronto = (l: LoteBase, motivo: string, r: Resultado, extra: Partial<Escolha> = {}): Escolha =>
    ({ escolhido: l, fonte: l.fonte, motivo, avisos, alternativas: r.lotes.slice(1), ...extra });

  if (!banco.ok) avisos.push(`Base no Supabase indisponível: ${banco.erro}`);
  if (!vivo.ok) avisos.push(`GeoPortal indisponível: ${vivo.erro}`);
  if (!banco.ok && !vivo.ok) return { motivo: 'Nenhuma fonte respondeu: usar caminho manual (coordenada digitada ou mapa).', avisos, alternativas: [] };

  // preferência fixada pelo administrador (só vale se aquela fonte achou o lote)
  if (preferencia === 'banco' && banco.ok && melhor(banco)) return pronto(melhor(banco), 'Preferência do administrador: base no Supabase.', banco);
  if (preferencia === 'geoportal' && vivo.ok && melhor(vivo)) return pronto(melhor(vivo), 'Preferência do administrador: GeoPortal.', vivo);

  const b = banco.ok ? melhor(banco) : undefined, v = vivo.ok ? melhor(vivo) : undefined;
  if (!b && !v) return { motivo: 'Lote não encontrado em nenhuma fonte.', avisos, alternativas: [] };
  if (b && !v) {
    if (vivo.ok) avisos.push('O GeoPortal respondeu, mas não encontrou este lote (pode ter sido alterado desde a data da base).');
    return pronto(b, vivo.ok ? 'Só a base no Supabase tem o lote.' : 'GeoPortal fora do ar: usada a base no Supabase.', banco);
  }
  if (v && !b) {
    if (banco.ok) avisos.push('A base no Supabase não tem este lote (pode estar desatualizada).');
    return pronto(v, banco.ok ? 'Só o GeoPortal tem o lote.' : 'Base no Supabase indisponível: usado o GeoPortal.', vivo);
  }
  // as duas têm
  const pb = pontos(b!.confere), pv = pontos(v!.confere);
  const d = Math.max(...b!.aneis.map(x => Math.min(...v!.aneis.map(y => distanciaEntreAneis(x, y)))));
  const divergenciaM = Number.isFinite(d) ? Math.round(d * 100) / 100 : undefined;
  if (divergenciaM !== undefined && divergenciaM > toleranciaM)
    avisos.push(`As duas fontes divergem em até ${divergenciaM} m na forma do lote (base de ${b!.baseData ?? 'data desconhecida'}): confira no mapa.`);
  if (pb !== pv) {
    const venceBanco = pb > pv;
    return pronto(venceBanco ? b! : v!, `As duas responderam; ${venceBanco ? 'a base no Supabase' : 'o GeoPortal'} casa melhor com lote/gleba/nome.`, venceBanco ? banco : vivo, { divergenciaM });
  }
  return pronto(v!, divergenciaM !== undefined && divergenciaM <= toleranciaM
    ? 'As duas fontes concordam; usado o GeoPortal (mais atual).'
    : 'Empate no casamento; usado o GeoPortal (mais atual).', vivo, { divergenciaM });
}

/** Faz tudo: consulta as duas fontes em paralelo e escolhe. */
export async function localizarLote(
  q: Consulta,
  deps: { rpc: Rpc; preferencia?: 'auto' | 'banco' | 'geoportal'; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<{ banco: Resultado; geoportal: Resultado; escolha: Escolha }> {
  const [banco, geoportal] = await Promise.all([
    buscarNoBanco(deps.rpc, q),
    buscarNoGeoportal(q, { timeoutMs: deps.timeoutMs, fetchImpl: deps.fetchImpl }),
  ]);
  return { banco, geoportal, escolha: escolherFonte(banco, geoportal, deps.preferencia ?? 'auto') };
}

/** Anel externo do lote (lon/lat) -> UTM do fuso do memorial, no formato que buscarAncoras espera. */
export function aneilParaUtm(anel: Anel, fuso: number): [number, number][] {
  const pts = anel.map(([lo, la]) => { const u = lonLatParaUtm(lo, la, fuso); return [u.E, u.N] as [number, number]; });
  const [a, z] = [pts[0], pts[pts.length - 1]];
  return a[0] === z[0] && a[1] === z[1] ? pts.slice(0, -1) : pts;
}
