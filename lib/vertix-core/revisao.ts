import { dmsToDeg, DMS_SRC, formatDMS, norm360, num, rumoToAzimute } from './angulos';
import { Segmento } from './memorial';
import { calcularPoligonal } from './poligonal';
import { RodapePlanta } from './planta';

// ---------- edição da tabela ----------
export interface AnguloLido { azimute: number; tipo: 'azimute' | 'rumo' }

/** Aceita "92°33'41,91\"", "4°56'34" (sem aspas), "N 45°10'20\" E", "S80°E" e decimal "92,5615". */
export function lerAnguloLivre(txt: string): AnguloLido | undefined {
  const s = txt.trim();
  if (!s) return undefined;
  const r = new RegExp(`^([NS])\\s*${DMS_SRC}\\s*([EWLO])$`, 'i').exec(s);
  if (r) {
    const deg = dmsToDeg(r[2], r[3], r[4]);
    if (deg > 90 || Number(r[3]) >= 60 || (r[4] && num(r[4]) >= 60)) return undefined;
    return { azimute: norm360(rumoToAzimute(r[1], deg, r[5])), tipo: 'rumo' };
  }
  const a = new RegExp(`^${DMS_SRC}$`).exec(s);
  if (a) {
    if (Number(a[2]) >= 60 || (a[3] && num(a[3]) >= 60)) return undefined;
    const v = dmsToDeg(a[1], a[2], a[3]);
    return v < 360 ? { azimute: v, tipo: 'azimute' } : undefined;
  }
  if (/^\d{1,3}(?:[.,]\d+)?$/.test(s)) { const v = num(s); return v < 360 ? { azimute: v, tipo: 'azimute' } : undefined; }
  return undefined;
}
export const textoAzimute = (az: number) => formatDMS(az, 2);

export interface Problema { linha: number; campo: 'de' | 'para' | 'azimute' | 'distancia' | 'geral'; msg: string }

export function validarSegmentos(segs: Segmento[]): Problema[] {
  const p: Problema[] = [];
  if (segs.length < 3) p.push({ linha: 0, campo: 'geral', msg: 'Uma poligonal precisa de pelo menos 3 segmentos.' });
  segs.forEach((s, i) => {
    if (!s.de?.trim()) p.push({ linha: i, campo: 'de', msg: 'Vértice de partida vazio.' });
    if (!s.para?.trim()) p.push({ linha: i, campo: 'para', msg: 'Vértice de chegada vazio.' });
    if (!Number.isFinite(s.azimute) || s.azimute < 0 || s.azimute >= 360) p.push({ linha: i, campo: 'azimute', msg: 'Azimute inválido (0° a 360°).' });
    if (!Number.isFinite(s.distancia) || s.distancia <= 0) p.push({ linha: i, campo: 'distancia', msg: 'Distância deve ser maior que zero.' });
    if (i > 0 && s.de && segs[i - 1].para && s.de !== segs[i - 1].para) p.push({ linha: i, campo: 'de', msg: `Deveria partir de ${segs[i - 1].para} (fim do segmento anterior).` });
  });
  if (segs.length >= 3 && segs[0].de && segs[segs.length - 1].para && segs[0].de !== segs[segs.length - 1].para)
    p.push({ linha: segs.length - 1, campo: 'para', msg: `O último segmento deveria voltar a ${segs[0].de}.` });
  return p;
}

// ---------- relatório de validação ----------
export interface Declarados { areaHa?: number; perimetroM?: number }
export interface Check { id: string; rotulo: string; status: 'ok' | 'atencao' | 'erro' | 'sem_dado'; detalhe: string }
export interface Relatorio {
  calculavel: boolean;
  perimetroM: number; fechamentoM: number; precisao: number; areaHa: number;
  checks: Check[];
  situacao: 'ok' | 'atencao' | 'erro';
}

const pct = (a: number, b: number) => (Math.abs(a - b) / b) * 100;
const f2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function relatorioPoligonal(segs: Segmento[], memorial: Declarados, planta: RodapePlanta = {}): Relatorio {
  if (validarSegmentos(segs).length) return { calculavel: false, perimetroM: 0, fechamentoM: 0, precisao: 0, areaHa: 0, situacao: 'erro', checks: [{ id: 'tabela', rotulo: 'Tabela de segmentos', status: 'erro', detalhe: 'Corrija os problemas da tabela para calcular.' }] };
  const pol = calcularPoligonal(segs);
  const checks: Check[] = [];
  const prec = pol.precisao;
  checks.push({
    id: 'fechamento', rotulo: 'Fechamento da poligonal',
    status: prec >= 10000 ? 'ok' : prec >= 5000 ? 'atencao' : 'erro',
    detalhe: `Erro de ${f2(pol.fechamentoLinear)} m em ${f2(pol.perimetro)} m (1:${Math.round(prec).toLocaleString('pt-BR')}).`,
  });
  const comp = (id: string, rotulo: string, calc: number, ref: number | undefined, unid: string, tolOk: number, tolAt: number, fonte: string): Check =>
    ref == null
      ? { id, rotulo, status: 'sem_dado', detalhe: `Sem valor declarado ${fonte}.` }
      : { id, rotulo, status: pct(calc, ref) <= tolOk ? 'ok' : pct(calc, ref) <= tolAt ? 'atencao' : 'erro', detalhe: `Calculado ${f2(calc)} ${unid}; ${fonte}: ${f2(ref)} ${unid} (diferença ${pct(calc, ref).toFixed(2)}%).` };
  checks.push(comp('area_memorial', 'Área × memorial', pol.areaHa, memorial.areaHa, 'ha', 0.5, 2, 'memorial'));
  checks.push(comp('perimetro_memorial', 'Perímetro × memorial', pol.perimetro, memorial.perimetroM, 'm', 0.05, 0.5, 'memorial'));
  checks.push(comp('area_planta', 'Área × planta', pol.areaHa, planta.areaHa, 'ha', 0.5, 2, 'planta'));
  checks.push(comp('perimetro_planta', 'Perímetro × planta', pol.perimetro, planta.perimetroM, 'm', 0.05, 0.5, 'planta'));
  const ordem = { erro: 2, atencao: 1, ok: 0, sem_dado: 0 } as const;
  const pior = checks.reduce((m, c) => Math.max(m, ordem[c.status]), 0);
  return { calculavel: true, perimetroM: pol.perimetro, fechamentoM: pol.fechamentoLinear, precisao: prec, areaHa: pol.areaHa, checks, situacao: pior === 2 ? 'erro' : pior === 1 ? 'atencao' : 'ok' };
}

/** Confere lote e gleba entre memorial e planta (pelo número inicial do lote; gleba sem diferenciar maiúsculas/zeros à esquerda). */
export function conferirIdentificacao(memorial: { lote?: string; gleba?: string }, planta: RodapePlanta): Check[] {
  const n = (s?: string) => /^\d+/.exec(s ?? '')?.[0]?.replace(/^0+/, '');
  const g = (s?: string) => (s ?? '').toUpperCase().replace(/^0+/, '');
  const out: Check[] = [];
  out.push(!memorial.lote || !planta.lote
    ? { id: 'lote_planta', rotulo: 'Lote × planta', status: 'sem_dado', detalhe: 'Lote não lido em um dos documentos.' }
    : { id: 'lote_planta', rotulo: 'Lote × planta', status: memorial.lote.toUpperCase() === planta.lote.toUpperCase() ? 'ok' : n(memorial.lote) === n(planta.lote) ? 'atencao' : 'erro', detalhe: `Memorial: ${memorial.lote}; planta: ${planta.lote}.` });
  out.push(!memorial.gleba || !planta.gleba
    ? { id: 'gleba_planta', rotulo: 'Gleba × planta', status: 'sem_dado', detalhe: 'Gleba não lida em um dos documentos.' }
    : { id: 'gleba_planta', rotulo: 'Gleba × planta', status: g(memorial.gleba) === g(planta.gleba) ? 'ok' : 'erro', detalhe: `Memorial: ${memorial.gleba}; planta: ${planta.gleba}.` });
  return out;
}
