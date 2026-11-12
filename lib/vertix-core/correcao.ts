// Correção automática de distância quando o próprio memorial se contradiz.
// Só corrige quando há evidência independente: as coordenadas escritas no memorial e o perímetro declarado
// concordam com o mesmo valor. Caso contrário, não mexe e apenas aponta a suspeita.
import { lonLatParaUtm } from './utm';
import { fusoDaLongitude } from './coordenadas';

export interface SegmentoComDistancia { de: string; para: string; distancia: number }
export interface CorrecaoAplicada { linha: number; de: string; para: string; antes: number; depois: number; motivo: string }
export interface ResultadoCorrecao<T> { segs: T[]; correcoes: CorrecaoAplicada[]; suspeitas: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function corrigirDistancias<T extends SegmentoComDistancia>(
  segs: T[],
  coords: Record<string, { lat: number; lon: number }> | undefined,
  perimetroDeclarado?: number,
  tolM = 0.5,
): ResultadoCorrecao<T> {
  const correcoes: CorrecaoAplicada[] = [];
  const suspeitas: string[] = [];
  if (!coords || !segs.length) return { segs, correcoes, suspeitas };

  const lons = segs.map((s) => coords[s.de]).filter(Boolean).map((p) => p!.lon);
  if (!lons.length) return { segs, correcoes, suspeitas };
  const fuso = fusoDaLongitude(lons.reduce((a, b) => a + b, 0) / lons.length);

  const utm = (p: { lat: number; lon: number } | undefined) => (p ? lonLatParaUtm(p.lon, p.lat, fuso) : undefined);
  const novas = segs.map((s) => s.distancia);

  segs.forEach((s, i) => {
    const a = utm(coords[s.de]);
    const b = utm(coords[s.para]);
    if (!a || !b) return;
    const dc = Math.hypot(b.E - a.E, b.N - a.N);
    if (Math.abs(s.distancia - dc) <= tolM) return;

    // candidatos: o que fecha o perímetro declarado (mais forte) e o que vem das coordenadas
    const somaOutros = novas.reduce((acc, d, j) => (j === i ? acc : acc + d), 0);
    const porPerimetro = perimetroDeclarado != null ? r2(perimetroDeclarado - somaOutros) : NaN;
    const candidato = Number.isFinite(porPerimetro) && porPerimetro > 0 && Math.abs(porPerimetro - dc) <= 0.1 ? porPerimetro : r2(dc);
    const perimetroFecha = perimetroDeclarado != null && Math.abs(somaOutros + candidato - perimetroDeclarado) <= 0.05;

    if (perimetroFecha) {
      correcoes.push({
        linha: i + 1, de: s.de, para: s.para, antes: s.distancia, depois: candidato,
        motivo: `as coordenadas do memorial dão ${fmt(dc)} m e o perímetro declarado (${fmt(perimetroDeclarado!)} m) só fecha com ${fmt(candidato)} m`,
      });
      novas[i] = candidato;
    } else {
      suspeitas.push(`${s.de} → ${s.para}: o memorial diz ${fmt(s.distancia)} m, mas as coordenadas dão ${fmt(dc)} m. Não corrigido automaticamente: confira.`);
    }
  });

  const out = segs.map((s, i) => (novas[i] !== s.distancia ? { ...s, distancia: novas[i] } : s));
  return { segs: out, correcoes, suspeitas };
}

export function textoCorrecao(c: CorrecaoAplicada): string {
  return `Corrigido automaticamente: ${c.de} → ${c.para} estava ${fmt(c.antes)} m no arquivo e foi para ${fmt(c.depois)} m, porque ${c.motivo}.`;
}
