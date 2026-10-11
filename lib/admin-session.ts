import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

const COOKIE_NAME = "admin_session"
const SESSION_TTL_SECONDS = 8 * 60 * 60

type AdminSession = { userId: string; exp: number }

function secret() {
  return process.env.ADMIN_SESSION_SECRET ?? ""
}

function panelPasswordHash() {
  return process.env.ADMIN_PANEL_PASSWORD_HASH ?? process.env.ADMIN_PANEL_PASSWORD_HASH_2 ?? ""
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url")
}

export function createAdminSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function verifyAdminSession(value: string | undefined): AdminSession | null {
  if (!value || !secret()) return null
  const [payload, signature] = value.split(".")
  if (!payload || !signature) return null
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as AdminSession
    return session.exp > Math.floor(Date.now() / 1000) && session.userId ? session : null
  } catch {
    return null
  }
}

export async function getAdminSession() {
  return verifyAdminSession((await cookies()).get(COOKIE_NAME)?.value)
}

export async function setAdminSession(userId: string) {
  ;(await cookies()).set(COOKIE_NAME, createAdminSession(userId), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function clearAdminSession() {
  ;(await cookies()).delete(COOKIE_NAME)
}

export { COOKIE_NAME }

export function isAdminSessionConfigured() {
  return Boolean(secret() && panelPasswordHash())
}

export function verifyPanelPassword(password: string) {
  const stored = panelPasswordHash()
  const [algorithm, salt, encodedHash] = stored.split("$")
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false
  try {
    const { scryptSync } = require("node:crypto") as typeof import("node:crypto")
    const actual = scryptSync(password, salt, 64)
    const expected = Buffer.from(encodedHash, "hex")
    return expected.length === actual.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
