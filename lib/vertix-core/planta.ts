import { num } from './angulos';

/** O que dá para ler como TEXTO da planta: o rodapé (lote, gleba, área, perímetro).
 *  A tabela de lados da planta costuma ser desenho (vetor), não texto: por isso a conferência
 *  de segmentos é visual (planta ao lado da tabela) e a numérica usa só estes totais. */
export interface RodapePlanta { lote?: string; gleba?: string; quadra?: string; areaHa?: number; perimetroM?: number }

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
  // Layout urbano (rodapé com SETOR / QUADRA / LOTE em colunas, FRENTE / FUNDO / LADO DIREITO / LADO ESQUERDO).
  if (!out.lote) {
    const cols = /SETOR\s+QUADRA\s+LOTE[\s\S]{0,240}?\n[ \t]*(\d{1,4})[ \t]+(\d{1,4})[ \t]+(\d{1,4}[A-Za-z]?)\b/i.exec(t);
    if (cols) { out.quadra = cols[2].replace(/^0+(?=\d)/, ''); out.lote = cols[3].toUpperCase(); }
  }
  if (out.areaHa === undefined) {
    const a = new RegExp(`(${NUM})\\s*m\\s*[²2](?!\\d)`, 'i').exec(t);
    if (a) out.areaHa = num(a[1]) / 10000;
  }
  if (out.perimetroM === undefined) {
    // os quatro lados da tabela de confrontações somam o perímetro; um lado pode vir partido ("6,14m + 1,82m")
    const numeroNoLado = (v: string) => (v.includes(',') ? Number(v.replace(/\./g, '').replace(',', '.')) : Number(v));
    const lados = ['FRENTE', 'FUNDO', 'LADO DIREITO', 'LADO ESQUERDO'].map(rot => {
      // o rótulo também aparece no cabeçalho ("FRENTE (m)"): fica com a primeira ocorrência seguida de medida
      for (const r of t.matchAll(new RegExp(`${rot}[ \\t]+([^\\n]{0,60})`, 'gi'))) {
        const partes = [...r[1].matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*m\b/gi)].map(x => numeroNoLado(x[1]));
        if (partes.length) return partes.reduce((x, y) => x + y, 0);
      }
      return undefined;
    });
    if (lados.every(v => v !== undefined && Number.isFinite(v))) out.perimetroM = Math.round((lados as number[]).reduce((x, y) => x + y, 0) * 100) / 100;
  }
  return out;
}
