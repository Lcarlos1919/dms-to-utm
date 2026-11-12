import { num } from './angulos';

/** O que dá para ler como TEXTO da planta: o rodapé (lote, gleba, área, perímetro).
 *  A tabela de lados da planta costuma ser desenho (vetor), não texto: por isso a conferência
 *  de segmentos é visual (planta ao lado da tabela) e a numérica usa só estes totais. */
export interface RodapePlanta { lote?: string; gleba?: string; areaHa?: number; perimetroM?: number }

const NUM = '\\d{1,3}(?:\\.\\d{3})*,\\d+';

export function lerRodapePlanta(textoBruto: string): RodapePlanta {
  const t = textoBruto.replace(/ /g, ' ');
  const out: RodapePlanta = {};
  const lote = /LOTE:\s*([0-9]+[A-Za-z0-9-]*)/i.exec(t); if (lote) out.lote = lote[1].toUpperCase();
  const gleba = /GLEBA:\s*([0-9]+[A-Za-z]?)\b/i.exec(t); if (gleba) out.gleba = gleba[1].toUpperCase();
  // O texto sai em ordens diferentes conforme o extrator: o valor pode vir antes ou depois do rótulo.
  const area = new RegExp(`(${NUM})\\s*ha\\b`, 'i').exec(t); if (area) out.areaHa = num(area[1]);
  // "Perímetro" também aparece na legenda do desenho: usamos TODAS as ocorrências do rótulo
  // e ficamos com o número em vírgula decimal mais próximo de qualquer uma delas.
  const rotulos = [...t.matchAll(/PER[ÍI]METRO\s*:/gi)].map(x => x.index!);
  if (rotulos.length) {
    const re = new RegExp(`(${NUM})(?!\\d)(?!\\s*ha)`, 'gi');
    const cand: { v: number; d: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      if (num(m[1]) === out.areaHa) continue;
      const d = Math.min(...rotulos.map(ip => (m!.index >= ip ? m!.index - ip : ip - (m!.index + m![0].length))));
      if (d <= 150) cand.push({ v: num(m[1]), d });
    }
    cand.sort((x, y) => x.d - y.d);
    if (cand.length) out.perimetroM = cand[0].v;
  }
  return out;
}
