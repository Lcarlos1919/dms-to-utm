import type { Aviso, Geometria, Vertice } from "./tipos";
import { distanciaGeodesica } from "./geodesia";

/** Área pela fórmula do cadarço (shoelace) em este/norte; polígono fechado implicitamente. */
export function areaPlanimetrica(v: Pick<Vertice, "este" | "norte">[]): number {
  // Translada para o 1º vértice: evita perder precisão com produtos de ~4e12 (E ~5e5 × N ~9e6).
  const o = v[0];
  if (!o) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const p = v[i]!, q = v[(i + 1) % v.length]!;
    s += (p.este - o.este) * (q.norte - o.norte) - (q.este - o.este) * (p.norte - o.norte);
  }
  return Math.abs(s) / 2;
}

/** Perímetro na grade UTM, incluindo último -> primeiro. */
export function perimetroGrade(v: Pick<Vertice, "este" | "norte">[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const p = v[i]!, q = v[(i + 1) % v.length]!;
    s += Math.hypot(q.este - p.este, q.norte - p.norte);
  }
  return s;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r7 = (x: number) => Math.round(x * 1e7) / 1e7;

/**
 * Calcula área, perímetros, fechamento e divergência de distâncias.
 * Distância do memorial x geodésica GRS80 (hipótese D1: a distância do memorial é geodésica).
 */
export function calcularGeometria(
  vertices: Vertice[],
  limiteDivergenciaM = 0.1,
  ignorarDivergencia = false,
): { geometria: Geometria; avisos: Aviso[] } {
  const avisos: Aviso[] = [];
  const porCodigo = new Map(vertices.map((v) => [v.codigo, v]));

  if (vertices.length < 3) {
    avisos.push({ codigo: "POUCOS_VERTICES", mensagem: "Menos de 3 vértices: área e perímetro não são confiáveis." });
  }

  const vistos = new Set<string>();
  for (const v of vertices) {
    if (vistos.has(v.codigo)) {
      avisos.push({ codigo: "CODIGO_DUPLICADO", mensagem: `Código de vértice repetido: ${v.codigo}.` });
    }
    vistos.add(v.codigo);
  }

  const primeiro = vertices[0];
  const ultimo = vertices[vertices.length - 1];
  const fechado = !!primeiro && !!ultimo && ultimo.vante === primeiro.codigo;
  if (!fechado) {
    avisos.push({
      codigo: "POLIGONO_ABERTO",
      mensagem: `A vante do último vértice (${ultimo?.vante ?? "?"}) não é o primeiro vértice (${primeiro?.codigo ?? "?"}).`,
    });
  }

  let divMax: number | null = null;
  // Com vértices editados (lon/lat desatualizados) a comparação não faz sentido: ignorarDivergencia = true.
  for (const v of ignorarDivergencia ? [] : vertices) {
    const alvo = porCodigo.get(v.vante);
    if (!alvo) continue;
    const d = distanciaGeodesica(v.lon, v.lat, alvo.lon, alvo.lat);
    if (!Number.isFinite(d)) continue;
    const dif = Math.abs(v.distancia - d);
    if (divMax === null || dif > divMax) divMax = dif;
    if (dif > limiteDivergenciaM) {
      avisos.push({
        codigo: "DIVERGENCIA_DISTANCIA",
        mensagem: `${v.codigo} -> ${v.vante}: memorial ${v.distancia.toFixed(2)} m, recalculada ${d.toFixed(2)} m (diferença ${dif.toFixed(3)} m).`,
      });
    }
  }

  const area = areaPlanimetrica(vertices);
  const perGrade = perimetroGrade(vertices);
  const perMem = vertices.reduce((s, v) => s + v.distancia, 0);

  return {
    geometria: {
      areaM2: r3(area),
      areaHa: Math.round((area / 10000) * 1e6) / 1e6,
      perimetroGradeM: r3(perGrade),
      perimetroMemorialM: r3(perMem),
      razaoGradeSobreMemorial: perMem > 0 ? r7(perGrade / perMem) : 0,
      divergenciaMaxDistanciaM: divMax === null ? null : r4(divMax),
      poligonoFechado: fechado,
    },
    avisos,
  };
}
