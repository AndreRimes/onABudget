import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthenticated = await verifySession(request);

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
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
};
