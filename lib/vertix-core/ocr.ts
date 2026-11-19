// Leitura de PDFs escaneados: normalização do texto vindo de OCR, conferência
// da leitura e escolha da ordem dos motores. Funções puras (testáveis sem rede).
import { num } from './angulos';
import { lerMemorial, type MemorialLido } from './memorial';
import { montarPoligonal } from './montagem';

export type MotorOcr = 'tesseract' | 'ocrspace' | 'azure' | 'google' | 'claude';

export const NOME_MOTOR: Record<MotorOcr, string> = {
  tesseract: 'Tesseract (local)',
  ocrspace: 'OCR.space',
  azure: 'Azure Document Intelligence',
  google: 'Google Cloud Vision',
  claude: 'Claude (Anthropic)',
};

/** Limites dos planos gratuitos usados na escolha (conferir nas páginas oficiais). */
export const LIMITES = {
  tesseractMaxPaginas: 10,      // custo de CPU na função da Vercel
  ocrspaceMaxBytes: 1024 * 1024, // plano grátis: arquivo de até 1 MB
  ocrspaceMaxPaginas: 3,         // plano grátis: até 3 páginas por PDF
  azureMaxPaginas: 2,            // plano F0: só as 2 primeiras páginas de cada envio
  googleMaxPaginas: 5,           // envio síncrono de PDF: até 5 páginas por chamada
};

export interface DocumentoInfo {
  paginas: number;
  bytes: number;
}

/**
 * Ordem dos motores para um documento: primeiro os gratuitos que comportam o arquivo
 * (local → Azure para até 2 páginas → OCR.space para arquivos pequenos), depois o
 * Google Cloud Vision e, por último, o Claude. Só entra motor configurado.
 */
export function planejarMotores(doc: DocumentoInfo, configurados: ReadonlySet<MotorOcr>): MotorOcr[] {
  const plano: MotorOcr[] = [];
  const pode = (m: MotorOcr) => configurados.has(m);
  if (pode('tesseract') && doc.paginas <= LIMITES.tesseractMaxPaginas) plano.push('tesseract');
  const cabeAzure = pode('azure') && doc.paginas <= LIMITES.azureMaxPaginas;
  const cabeOcrSpace = pode('ocrspace') && doc.bytes <= LIMITES.ocrspaceMaxBytes && doc.paginas <= LIMITES.ocrspaceMaxPaginas;
  // Azure lê tabelas melhor; OCR.space entra antes só quando o Azure não comporta o documento.
  if (cabeAzure) plano.push('azure');
  if (cabeOcrSpace) plano.push('ocrspace');
  if (pode('google')) plano.push('google');
  if (pode('claude')) plano.push('claude');
  return plano;
}

/**
 * Corrige confusões típicas de OCR em memoriais datilografados:
 * grau como "0" sobrescrito ou espaço, minuto lido como "1" ou "•", hífens trocados
 * por travessão/igual, "]" no lugar de "1", milhar com vírgula (2,062,35).
 */
export function normalizarOcr(texto: string): string {
  let t = texto
    .replace(/[ \t]+/g, ' ')
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′´`]/g, "'")
    .replace(/[º˚⁰]/g, '°');
  // Vértices: "M=1377", "M—1341", "M 1341" -> "M-1377"; "M-134]" -> "M-1341".
  t = t.replace(/\b([A-Z]{1,3})\s?[=—–-]\s?(\d{1,4})[\]|](?=\s|$)/g, '$1-$21');
  t = t.replace(/\b([A-Z]{1,3})\s?[=—–]\s?(\d{1,4})\b/g, '$1-$2');
  t = t.replace(/\b([A-Z]{1,2})(\d{3,4})\b/g, '$1-$2'); // "M1376" -> "M-1376"
  // Separador entre vértices: "M-1343 — M-1341" / "M-1343 = M-1341".
  t = t.replace(/(\b[A-Z]{1,3}-\d{1,4})\s+[—–=]\s+(?=[A-Z]{1,3}-\d)/g, '$1 - ');
  // Ângulo sem símbolo de grau: "179054'50"", "90 29142"", "20°51•38"".
  t = t.replace(
    /(^|[^\d,.])(\d{1,3})(?:\s*[°0o]\s*|\s+)(\d{2})\s*['•·*1]\s*(\d{2}(?:[.,]\d+)?)\s*(?:"|'')/gm,
    (m, pre: string, g: string, mi: string, s: string) =>
      Number(g) < 360 && Number(mi) < 60 && num(s) < 60 ? `${pre}${g}°${mi}'${s}"` : m,
  );
  // Distâncias: "2,062,35" -> "2.062,35"; "2, 080,77" -> "2.080,77".
  t = t.replace(/\b(\d{1,3}),\s?(\d{3}),(\d{2,3})\b/g, '$1.$2,$3');
  return t;
}

export interface AvaliacaoLeitura {
  memorial: MemorialLido;
  aprovada: boolean;
  pontos: number;
  motivo: string;
  perimetroDeclaradoM?: number;
  perimetroCalculadoM?: number;
}

const NUM_BR = '\\d{1,3}(?:\\.\\d{3})*,\\d+|\\d+[.,]\\d+';

/** Perímetro e área declarados em qualquer formato comum de cabeçalho. */
export function totaisDeclarados(texto: string): { perimetroM?: number; areaHa?: number } {
  const per = new RegExp(`PER(?:[ÍI]METRO)?\\.?\\s*(?:\\(m\\))?\\s*:?\\s*(${NUM_BR})`, 'i').exec(texto);
  const area = new RegExp(`(?:[ÁA]REA\\s*(?:\\(ha\\))?\\s*:?\\s*(${NUM_BR}))|(?:(${NUM_BR})\\s*ha\\b)`, 'i').exec(texto);
  return {
    perimetroM: per ? num(per[1]) : undefined,
    areaHa: area ? num(area[1] ?? area[2]) : undefined,
  };
}

/**
 * Lê o texto de OCR como memorial e diz se a leitura é confiável:
 * ao menos 3 lados encadeados que voltam ao início e, quando o documento declara
 * o perímetro, soma das distâncias igual a ele (tolerância de 0,02%, mín. 10 cm).
 */
export function avaliarMemorialOcr(textoOcr: string): AvaliacaoLeitura {
  const texto = normalizarOcr(textoOcr);
  const memorial = lerMemorial(texto);
  const decl = totaisDeclarados(texto);
  if (memorial.perimetroM === undefined && decl.perimetroM) memorial.perimetroM = decl.perimetroM;
  if (memorial.areaHa === undefined && decl.areaHa) memorial.areaHa = decl.areaHa;
  return avaliarMemorial(memorial);
}

/** Mesmos critérios para uma leitura já estruturada (ex.: transcrição por IA). */
export function avaliarMemorial(memorial: MemorialLido): AvaliacaoLeitura {
  const segs = memorial.segmentos;
  const base = { memorial, perimetroDeclaradoM: memorial.perimetroM };
  if (segs.length < 3) return { ...base, aprovada: false, pontos: segs.length, motivo: 'menos de 3 lados lidos' };

  let encadeado = true;
  for (let i = 1; i < segs.length; i++) if (segs[i].de !== segs[i - 1].para) encadeado = false;
  const fecha = segs[segs.length - 1].para === segs[0].de;
  const soma = segs.reduce((s, x) => s + x.distancia, 0);
  let pontos = segs.length * 10 + (encadeado ? 50 : 0) + (fecha ? 50 : 0);
  if (!encadeado || !fecha) {
    return { ...base, aprovada: false, pontos, motivo: !encadeado ? 'sequência de vértices quebrada' : 'não volta ao vértice inicial', perimetroCalculadoM: soma };
  }
  if (memorial.perimetroM) {
    // O perímetro declarado é a soma dos lados (arredondada): tolera 0,02% (mín. 10 cm).
    const tol = Math.max(0.1, memorial.perimetroM * 0.0002);
    if (Math.abs(soma - memorial.perimetroM) > tol) {
      return { ...base, aprovada: false, pontos: pontos - 30, motivo: `soma dos lados (${soma.toFixed(2)} m) difere do perímetro declarado`, perimetroCalculadoM: soma };
    }
    pontos += 100;
  } else {
    // Sem perímetro declarado: exige fechamento linear razoável (1:1000).
    const pol = montarPoligonal(segs);
    if (pol.precisao < 1000) return { ...base, aprovada: false, pontos, motivo: 'poligonal não fecha', perimetroCalculadoM: soma };
  }
  return { ...base, aprovada: true, pontos, motivo: 'ok', perimetroCalculadoM: soma };
}
