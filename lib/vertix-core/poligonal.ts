import { Segmento } from './memorial';

export interface Vertice { nome: string; x: number; y: number }
export interface Poligonal {
  vertices: Vertice[];          // sem repetir o ponto final
  perimetro: number;
  fechamentoLinear: number;     // distância entre o ponto calculado final e o inicial (m)
  precisao: number;             // perímetro / erro (ex.: 26000 => 1:26000)
  areaM2: number;
  areaHa: number;
  fechou: boolean;
}

/** Poligonal por irradiação sucessiva a partir de (x0,y0) em UTM/plano. */
export function calcularPoligonal(segs: Segmento[], x0 = 0, y0 = 0): Poligonal {
  const pts: Vertice[] = [{ nome: segs[0].de, x: x0, y: y0 }];
  let x = x0, y = y0, per = 0;
  for (const s of segs) {
    const a = (s.azimute * Math.PI) / 180;
    x += s.distancia * Math.sin(a);
    y += s.distancia * Math.cos(a);
    per += s.distancia;
    pts.push({ nome: s.para, x, y });
  }
  const ult = pts[pts.length - 1];
  const erro = Math.hypot(ult.x - x0, ult.y - y0);
  const vertices = pts.slice(0, ult.nome === pts[0].nome ? -1 : undefined);
  return {
    vertices, perimetro: per, fechamentoLinear: erro,
    precisao: erro > 0 ? per / erro : Infinity,
    areaM2: areaShoelace(vertices), areaHa: areaShoelace(vertices) / 1e4,
    fechou: ult.nome === pts[0].nome,
  };
}

export function areaShoelace(p: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; s += p[i].x * p[j].y - p[j].x * p[i].y; }
  return Math.abs(s) / 2;
}

/** Translada a poligonal para que o vértice `nome` caia em (x,y). */
export function ancorar(p: Poligonal, nome: string, x: number, y: number): Vertice[] {
  const v = p.vertices.find(v => v.nome === nome);
  if (!v) throw new Error(`Vértice ${nome} não existe`);
  return p.vertices.map(q => ({ nome: q.nome, x: q.x - v.x + x, y: q.y - v.y + y }));
}
