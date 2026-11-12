import { lonLatParaUtm } from './utm';

type Anel = number[][]; // [lon, lat][]
export interface GeomLote { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }

export interface LoteUtm {
  fuso: number;
  hemisferio: 'S' | 'N';
  pontos: [number, number][]; // vértices em UTM, sem repetir o último
  avisos: string[];
}

const areaAnel = (r: Anel) => { let s = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; s += r[i][0] * r[j][1] - r[j][0] * r[i][1]; } return Math.abs(s) / 2; };

/**
 * Converte a geometria devolvida por `buscar_lote` (coluna `geom`: GeoJSON em graus, SIRGAS 2000)
 * nos vértices em UTM que `buscarAncoras` espera. O fuso vem do centro do lote.
 */
export function loteParaUtm(geom: GeomLote): LoteUtm {
  const avisos: string[] = [];
  let aneis: Anel[];
  if (geom.type === 'Polygon') aneis = [(geom.coordinates as Anel[])[0]];
  else if (geom.type === 'MultiPolygon') aneis = (geom.coordinates as Anel[][]).map(p => p[0]);
  else throw new Error(`Geometria não suportada: ${String((geom as { type?: unknown }).type)}`);
  aneis = aneis.filter(a => Array.isArray(a) && a.length >= 4);
  if (!aneis.length) throw new Error('Geometria do lote sem anel válido');
  if (aneis.length > 1) avisos.push(`O lote tem ${aneis.length} partes; usada a maior. Conferir no mapa.`);
  const anel = aneis.reduce((a, b) => (areaAnel(b) > areaAnel(a) ? b : a));
  const aberto = anel[0][0] === anel[anel.length - 1][0] && anel[0][1] === anel[anel.length - 1][1] ? anel.slice(0, -1) : anel;
  const lonMedia = aberto.reduce((s, p) => s + p[0], 0) / aberto.length;
  const latMedia = aberto.reduce((s, p) => s + p[1], 0) / aberto.length;
  const fuso = Math.floor((lonMedia + 180) / 6) + 1;
  const hemisferio = latMedia < 0 ? 'S' : 'N';
  const pontos = aberto.map(([lon, lat]) => { const u = lonLatParaUtm(lon, lat, fuso); return [u.E, u.N] as [number, number]; });
  if (aberto.length <= 4) avisos.push(`A base traz o lote com só ${aberto.length} vértices (simplificado): tolerância de encaixe de 1 a 2 m.`);
  return { fuso, hemisferio, pontos, avisos };
}
