import "server-only"

export const MAX_PDF_SIZE = 10 * 1024 * 1024

type PdfBlobValidationResult =
  | { ok: true; sanitizedFileName: string; size: number }
  | { ok: false; error: string }

type PdfValidationResult =
  | { ok: true; file: File; sanitizedFileName: string; size: number }
  | { ok: false; error: string }

export function sanitizePdfFileName(fileName: string) {
  const fileLeaf = fileName.replace(/\\/g, "/").split("/").pop()?.normalize("NFC") ?? ""
  if (!fileLeaf.toLowerCase().endsWith(".pdf")) return null

  const safeStem = fileLeaf
    .slice(0, -4)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._() -]/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 120)

  return `${safeStem || "arquivo"}.pdf`
}

export async function validatePdfBlob(blob: Blob, fileName: string): Promise<PdfBlobValidationResult> {
  const sanitizedFileName = sanitizePdfFileName(fileName)
  if (!sanitizedFileName) return { ok: false, error: "O arquivo precisa ser um PDF válido." }
  if (blob.type !== "application/pdf" || blob.size > MAX_PDF_SIZE) {
    return { ok: false, error: "O arquivo precisa ser um PDF válido de até 10 MB." }
  }

  const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  if (String.fromCharCode(...magic) !== "%PDF") {
    return { ok: false, error: "O conteúdo do arquivo não é um PDF válido." }
  }

  return { ok: true, sanitizedFileName, size: blob.size }
}

export async function validatePdfFile(value: FormDataEntryValue | null): Promise<PdfValidationResult> {
  if (!(value instanceof File)) return { ok: false, error: "Selecione um arquivo PDF." }

  const validation = await validatePdfBlob(value, value.name)
  if (!validation.ok) return validation

  return { ...validation, file: value }
}
