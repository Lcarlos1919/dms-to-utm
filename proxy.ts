import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/admin/login(.*)",
  "/api/webhooks(.*)",
])
const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"])
const isAdminRoute = createRouteMatcher(["/admin(.*)"])

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return

  if (isDashboardRoute(request)) {
    const { userId } = await auth()
    if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url))
    return
  }

  if (isAdminRoute(request) && !request.nextUrl.pathname.startsWith("/admin/login")) {
    const { userId } = await auth()
    if (!userId) return NextResponse.redirect(new URL("/admin/login", request.url))
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
