export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "./server/better-auth";

export async function middleware(request: NextRequest) {
  console.log("Middleware running for:", request.url);
  const { pathname } = request.nextUrl;
  
  console.log("Extracted pathname:", pathname);
  const session = await auth.api.getSession({ headers: request.headers });
  const isAuthenticated = !!session?.user;
  console.log("User authenticated:", isAuthenticated);

  if (pathname.startsWith("/dashboard") && !isAuthenticated) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(authUrl);
  }

  if (pathname.startsWith("/auth") && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
};