import type { NextRequest } from "next/server";

/**
 * Proxy — Auth Redirect Handler (Next.js 16+)
 *
 * - Protects /dashboard and /project/* routes (redirects to /auth if no token)
 * - Redirects authenticated users from /auth to /dashboard
 * - Allows all other routes
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for auth token in cookies (set by frontend after login)
  const authToken = request.cookies.get("movieanimation_token")?.value;

  // Protected routes — redirect to auth if no token
  const protectedPaths = ["/dashboard", "/project", "/onboarding", "/help"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !authToken) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("redirect", pathname);
    return Response.redirect(url);
  }

  // If already authenticated, redirect /auth away to /dashboard
  if (pathname === "/auth" && authToken) {
    return Response.redirect(new URL("/dashboard", request.url));
  }

  // Allow the request to continue
  return;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public|api).*)",
  ],
};
