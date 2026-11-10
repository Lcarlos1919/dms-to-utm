import "server-only"

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json(
    { ok: false, error: message, ...(details === undefined ? {} : { details }) },
    { status, headers: { "content-type": "application/json" } },
  )
}

export function isSelfMutation(actorId: string, targetUserId: string) {
  return actorId === targetUserId
}
