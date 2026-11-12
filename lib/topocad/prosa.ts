import { lerMemorial } from "@/lib/vertix-core/memorial";
import { corrigirDistancias, textoCorrecao } from "@/lib/vertix-core/correcao";
import type { EntradaVertice } from "./motor";
import type { Aviso } from "./tipos";

/**
 * Memorial em texto corrido ("no vértice M-08, de coordenadas Lat ... e Long ..., azimute ... distância ...").
 * Sem tabela de vértices, usa a leitura por azimute: as coordenadas escritas no texto viram os vértices.
 * Distâncias que contradizem as coordenadas são corrigidas só quando o perímetro declarado confirma;
 * as demais viram aviso. Devolve lista vazia quando não há coordenadas suficientes.
 */
export function verticesDeProsa(texto: string): { vertices: EntradaVertice[]; avisos: Aviso[] } {
  const lido = lerMemorial(texto);
  const coords = lido.coordenadas ?? {};
  const segs = lido.segmentos ?? [];
  if (segs.length < 3 || !segs.every((s) => coords[s.de])) return { vertices: [], avisos: [] };

  const corr = corrigirDistancias(segs, coords, lido.perimetroM);
  const avisos: Aviso[] = [
    ...corr.correcoes.map((c) => ({ codigo: "CORRECAO_AUTOMATICA" as const, mensagem: textoCorrecao(c) })),
    ...corr.suspeitas.map((mensagem) => ({ codigo: "SUSPEITA_DISTANCIA" as const, mensagem })),
  ];

  const usar = corr.segs;
  const vertices = usar.map((s, i) => {
    const c = coords[s.de]!;
    const proximo = usar[(i + 1) % usar.length]!;
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
  return { vertices, avisos };
}
