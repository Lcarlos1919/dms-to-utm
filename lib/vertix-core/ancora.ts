import { Poligonal, Vertice, ancorar } from './poligonal';

type P = [number, number];
export interface Candidata {
  verticeMemorial: string;
  indiceLote: number;
  ponto: P;                 // coordenada da âncora (vértice do lote), no mesmo CRS do lote
  dentro: number;           // vértices do memorial dentro do lote ou sobre a divisa (tol)
  sobreDivisa: number;      // vértices a <= tol da divisa
  total: number;
  azimutesCasados: number;  // arestas do memorial paralelas (±tolAz°) a uma aresta do lote e encostadas nela
  pontuacao: number;
  vertices: Vertice[];      // poligonal já posicionada
}

function distPontoSegmento(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function distBorda(p: P, poly: P[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, distPontoSegmento(p, poly[i], poly[(i + 1) % poly.length]));
  return m;
}
function dentroPoligono(p: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const azAresta = (a: P, b: P) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
const difAz = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); } // direção, sem sentido

/**
 * Testa todas as combinações (vértice do memorial × vértice do lote).
 * Não decide: devolve as melhores, para o usuário confirmar no mapa.
 */
export function buscarAncoras(pol: Poligonal, lote: P[], opt: { tol?: number; tolAz?: number; max?: number } = {}): Candidata[] {
  const tol = opt.tol ?? 2, tolAz = opt.tolAz ?? 0.5;
  const res: Candidata[] = [];
  for (const vm of pol.vertices) {
    for (let j = 0; j < lote.length; j++) {
      const vs = ancorar(pol, vm.nome, lote[j][0], lote[j][1]);
      const pts = vs.map(v => [v.x, v.y] as P);
      let dentro = 0, borda = 0;
      for (const p of pts) {
        const d = distBorda(p, lote);
        if (d <= tol) { borda++; dentro++; } else if (dentroPoligono(p, lote)) dentro++;
      }
      let az = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (distBorda(a, lote) > tol || distBorda(b, lote) > tol) continue;
        const aa = azAresta(a, b);
        if (lote.some((_, k) => difAz(aa, azAresta(lote[k], lote[(k + 1) % lote.length])) <= tolAz)) az++;
      }
      const n = pts.length;
      const pont = (dentro / n) * 60 + (borda / n) * 20 + (az / n) * 20;
      res.push({ verticeMemorial: vm.nome, indiceLote: j, ponto: lote[j], dentro, sobreDivisa: borda, total: n, azimutesCasados: az, pontuacao: Math.round(pont * 10) / 10, vertices: vs });
    }
  }
  return res.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, opt.max ?? 5);
}
