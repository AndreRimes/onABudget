import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log(`[middleware] ${request.method} ${pathname}`);

  const isAuthenticated = await verifySession(request);

  console.log(`[middleware] isAuthenticated=${isAuthenticated} for path=${pathname}`);

  if (pathname.startsWith("/dashboard") && !isAuthenticated) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("callbackUrl", pathname);
    console.log(`[middleware] Redirecting unauthenticated user to ${authUrl.pathname}`);
    return NextResponse.redirect(authUrl);
  }

  if (pathname.startsWith("/auth") && isAuthenticated) {
    console.log(`[middleware] Redirecting authenticated user to /dashboard`);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

async function verifySession(request: NextRequest): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/auth/get-session", request.url), {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (!response.ok) return false;

    const session = (await response.json()) as { user?: unknown } | null;
    return !!session?.user;
  } catch (error) {
    console.error(`[middleware] verifySession error:`, error);
    return false;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
};
