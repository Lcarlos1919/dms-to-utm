// Ângulos: azimute e rumo em graus-minutos-segundos -> azimute decimal (0..360)
const DEG = '[°º˚]';
const MIN = "['′’´]";
const SEC = '["″”¨]|\'\'|′′';

/** Número com vírgula ou ponto decimal ("41,91" ou "41.91"). */
export function num(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
}

/** Casa um DMS tolerante: aspas de segundos podem faltar, minutos/segundos podem faltar. */
export const DMS_SRC = `(\\d{1,3})\\s*${DEG}\\s*(?:(\\d{1,2})\\s*${MIN}\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*(?:${SEC})?)?)?`;

/** Segundos: o ponto ou a vírgula são SEMPRE decimais (em segundos não existe separador de milhar). */
export const numDecimal = (s: string): number => parseFloat(s.replace(/\s/g, '').replace(',', '.'));

export function dmsToDeg(d: string, m?: string, s?: string): number {
  return Number(d) + (m ? Number(m) / 60 : 0) + (s ? numDecimal(s) / 3600 : 0);
}

export const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** "92°33'41,91\"" -> 92.5616..., undefined se não for um DMS. */
export function parseDMS(txt: string): number | undefined {
  const m = new RegExp(`^\\s*${DMS_SRC}\\s*$`).exec(txt);
  if (!m) return undefined;
  const v = dmsToDeg(m[1], m[2], m[3]);
  if (Number(m[2]) >= 60 || (m[3] && numDecimal(m[3]) >= 60)) return undefined;
  return v;
}

/** Rumo (quadrante) -> azimute. Ex.: N 45°10'20\" E, S 10° W. Aceita L/O (leste/oeste). */
export function rumoToAzimute(ns: string, deg: number, ew: string): number {
  const n = ns.toUpperCase() === 'N';
  const e = /^[EL]$/i.test(ew);
  if (n && e) return deg;
  if (!n && e) return 180 - deg;
  if (!n && !e) return 180 + deg;
  return 360 - deg;
}

export function formatDMS(az: number, casasSeg = 2): string {
  let t = Math.round(norm360(az) * 3600 * 10 ** casasSeg) / 10 ** casasSeg;
  const d = Math.floor(t / 3600); t -= d * 3600;
  const m = Math.floor(t / 60); t -= m * 60;
  return `${d}°${String(m).padStart(2, '0')}'${t.toFixed(casasSeg).padStart(casasSeg ? casasSeg + 3 : 2, '0')}"`;
}
