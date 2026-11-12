// Memoriais que trazem, além de azimute e distância, a coordenada geográfica de cada vértice.
// A poligonal (azimutes) é posicionada pelas coordenadas e as duas informações são conferidas
// uma contra a outra: divergência costuma ser erro de digitação no memorial.
import { ancorar, type Poligonal, type Vertice } from './poligonal';
import { lonLatParaUtm } from './utm';

export type CoordenadasMemorial = Record<string, { lat: number; lon: number }>;
export interface Residuo { nome: string; m: number | null } // null = vértice sem coordenada no memorial
export interface PosicaoPorCoordenadas {
  ancora: string;          // vértice usado para encostar a poligonal
  vertices: Vertice[];     // poligonal posicionada (UTM do fuso informado)
  residuos: Residuo[];     // distância entre o vértice calculado e a coordenada escrita
  concordam: number;       // vértices com coordenada a <= tol do calculado (inclui a âncora)
  comCoordenada: number;
}

export const fusoDaLongitude = (lon: number) => Math.floor((lon + 180) / 6) + 1;

/**
 * Tenta cada vértice com coordenada como âncora e fica com a que mais concorda com as demais
 * (assim um vértice com coordenada digitada errada não desloca o terreno inteiro).
 */
export function posicionarPorCoordenadas(pol: Poligonal, coords: CoordenadasMemorial | undefined, fuso: number, tol = 0.1): PosicaoPorCoordenadas | null {
  if (!coords) return null;
  const utm = new Map<string, { E: number; N: number }>();
  for (const v of pol.vertices) {
    const c = coords[v.nome];
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) utm.set(v.nome, lonLatParaUtm(c.lon, c.lat, fuso));
  }
  if (!utm.size) return null;
  let melhor: PosicaoPorCoordenadas | null = null;
  let somaMelhor = Infinity;
  for (const [nome, u] of utm) {
    const vertices = ancorar(pol, nome, u.E, u.N);
    const residuos = vertices.map((v) => { const c = utm.get(v.nome); return { nome: v.nome, m: c ? Math.hypot(c.E - v.x, c.N - v.y) : null }; });
    const dentro = residuos.filter((r) => r.m !== null && r.m <= tol);
    const soma = dentro.reduce((s, r) => s + (r.m ?? 0), 0);
    if (!melhor || dentro.length > melhor.concordam || (dentro.length === melhor.concordam && soma < somaMelhor)) {
      melhor = { ancora: nome, vertices, residuos, concordam: dentro.length, comCoordenada: utm.size };
      somaMelhor = soma;
    }
  }
  return melhor;
}
