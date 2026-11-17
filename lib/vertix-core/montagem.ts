// Montagem da poligonal final de um memorial por azimute:
// compensação do erro de fechamento (Bowditch), posicionamento pela âncora
// e escolha automática da âncora entre as candidatas da base fundiária.
import type { Segmento } from './memorial';
import type { Candidata } from './ancora';
import { calcularPoligonal, areaShoelace, type Vertice } from './poligonal';

export interface PoligonalMontada {
  vertices: Vertice[];            // sem repetir o ponto final, já compensados
  fechamentoLinearM: number;      // erro antes da compensação
  precisao: number;               // perímetro / erro
  perimetroM: number;
  areaM2: number;
  compensada: boolean;
}

/**
 * Calcula a poligonal a partir de (0,0) e distribui o erro de fechamento
 * proporcionalmente às distâncias (regra da bússola / Bowditch).
 * Só compensa quando o memorial volta ao vértice inicial.
 */
export function montarPoligonal(segs: Segmento[]): PoligonalMontada {
  const bruta = calcularPoligonal(segs);
  const fechou = segs.length >= 3 && segs[segs.length - 1].para === segs[0].de;
  const pts: Vertice[] = [{ nome: segs[0].de, x: 0, y: 0 }];
  let x = 0, y = 0;
  const per = bruta.perimetro;
  // erro = posição final calculada − posição inicial
  let ex = 0, ey = 0;
  for (const s of segs) {
    const a = (s.azimute * Math.PI) / 180;
    ex += s.distancia * Math.sin(a);
    ey += s.distancia * Math.cos(a);
  }
  const compensar = fechou && per > 0;
  for (const s of segs) {
    const a = (s.azimute * Math.PI) / 180;
    x += s.distancia * Math.sin(a) - (compensar ? (ex * s.distancia) / per : 0);
    y += s.distancia * Math.cos(a) - (compensar ? (ey * s.distancia) / per : 0);
    pts.push({ nome: s.para, x, y });
  }
  const vertices = fechou ? pts.slice(0, -1) : pts;
  return {
    vertices,
    fechamentoLinearM: bruta.fechamentoLinear,
    precisao: bruta.precisao,
    perimetroM: per,
    areaM2: areaShoelace(vertices),
    compensada: compensar,
  };
}

/** Translada a poligonal para que o vértice `nome` fique em (este, norte). */
export function posicionar(p: PoligonalMontada, nome: string, este: number, norte: number): Vertice[] {
  const v = p.vertices.find((q) => q.nome === nome);
  if (!v) throw new Error(`O vértice ${nome} não existe na tabela.`);
  return p.vertices.map((q) => ({ nome: q.nome, x: q.x - v.x + este, y: q.y - v.y + norte }));
}

export interface DecisaoAncora {
  automatica: boolean;
  escolhida?: Candidata;
  motivo: string;
  distintas: Candidata[];         // posições diferentes, melhores primeiro (para o usuário escolher)
}

/**
 * Decide se a melhor candidata é boa o bastante para ser usada sem perguntar:
 *  - todos os vértices do memorial dentro do lote (ou sobre a divisa);
 *  - pelo menos metade sobre a divisa;
 *  - pontuação >= 80 e pelo menos 10 pontos acima da próxima posição DIFERENTE.
 * Candidatas que dão a mesma posição (ex.: âncora P1→canto A e P2→canto B) contam como uma só.
 */
export function decidirAncora(candidatas: Candidata[], tolMesmaPosicaoM = 0.5): DecisaoAncora {
  const distintas: Candidata[] = [];
  for (const c of candidatas) {
    const p0 = c.vertices[0];
    if (!distintas.some((d) => Math.hypot(d.vertices[0].x - p0.x, d.vertices[0].y - p0.y) <= tolMesmaPosicaoM)) distintas.push(c);
  }
  const [a, b] = distintas;
  if (!a) return { automatica: false, motivo: 'Nenhuma posição candidata no lote.', distintas };
  const todosDentro = a.dentro === a.total;
  const divisa = a.sobreDivisa >= Math.ceil(a.total / 2);
  const folga = !b || a.pontuacao - b.pontuacao >= 10;
  if (todosDentro && divisa && a.pontuacao >= 80 && folga) {
    return { automatica: true, escolhida: a, motivo: `Encaixe no lote: ${a.sobreDivisa}/${a.total} vértices sobre a divisa (pontuação ${a.pontuacao}).`, distintas };
  }
  const porque = !todosDentro ? 'há vértices fora do lote' : !divisa ? 'poucos vértices sobre a divisa' : a.pontuacao < 80 ? `pontuação baixa (${a.pontuacao})` : 'há mais de uma posição possível';
  return { automatica: false, motivo: `Encaixe automático incerto: ${porque}.`, distintas };
}
