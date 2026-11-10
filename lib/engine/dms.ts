export function parsePtNumber(value: string) { const n = Number(value.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : undefined }
export function dmsToDecimal(deg: string, min: string, sec: string) { const d = Number(deg); const value = Math.abs(d) + Number(min) / 60 + parsePtNumber(sec)! / 3600; return d < 0 ? -value : value }
export function normalizeQuotes(value: string) { return value.replace(/[′’]/g, "'").replace(/[″”“]/g, '"').replace(/[º˚]/g, "°").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() }
export function parseDms(value: string) { const match = value.match(/(-?\d+)°(\d+)'([\d.,]+)"/); return match ? dmsToDecimal(match[1], match[2], match[3]) : undefined }
