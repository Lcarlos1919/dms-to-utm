import { lerMemorial } from "@/lib/vertix-core/memorial";
import type { EntradaVertice } from "./motor";

/**
 * Memorial em texto corrido ("no vértice M-08, de coordenadas Lat ... e Long ..., azimute ... distância ...").
 * Sem tabela de vértices, usa a leitura por azimute: as coordenadas escritas no próprio texto viram os vértices,
 * e as distâncias e azimutes do memorial são mantidos como estão.
 * Devolve [] quando não há coordenadas suficientes.
 */
export function verticesDeProsa(texto: string): EntradaVertice[] {
  const lido = lerMemorial(texto);
  const coords = lido.coordenadas ?? {};
  const segs = lido.segmentos ?? [];
  if (segs.length < 3) return [];
  const todos = segs.every((s) => coords[s.de]);
  if (!todos) return [];

  return segs.map((s, i) => {
    const c = coords[s.de]!;
    const proximo = segs[(i + 1) % segs.length]!;
    return {
      codigo: s.de,
      lon: c.lon,
      lat: c.lat,
      vante: proximo.de,
      azimuteDms: s.azimuteTexto,
      distancia: s.distancia,
      confrontacao: s.confrontante ?? "",
    };
  });
}
