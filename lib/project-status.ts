export const STALE_PROCESSING_MS = 5 * 60 * 1000

export const STALE_PROCESSING_MESSAGE =
  "O processamento demorou mais de 5 minutos e foi interrompido. Tente processar novamente."

export function staleProcessingCutoff(now = Date.now()) {
  return new Date(now - STALE_PROCESSING_MS).toISOString()
}

export function isStaleProcessing(status: string, updatedAt: string | null | undefined, now = Date.now()) {
  if (status !== "processing" || !updatedAt) return false
  const updated = new Date(updatedAt).getTime()
  return Number.isFinite(updated) && now - updated > STALE_PROCESSING_MS
}

export function displayDatum(datum: string | null | undefined) {
  const value = datum?.trim()
  if (!value) return "SIRGAS 2000"
  return value.replace(/^SIRGAS\s*2000$/i, "SIRGAS 2000")
}
