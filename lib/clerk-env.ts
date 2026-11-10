import "server-only"

function required(name: string, value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}. Configure-a nas Vars do v0.`)
  }
  return trimmed
}

export const clerkPublishableKey = required(
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
)
export function getClerkSecretKey() {
  return required("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY)
}
