import { NextResponse, type NextRequest } from "next/server";

/**
 * SITE_PASSWORD set = every page asks for that password (HTTP basic auth; any user name).
 * For a hosted demo: the example replies include prompts from gated datasets, so the site must
 * not be open to anyone with the link. Unset (local use) = no password.
 */

function sameText(a: string, b: string): boolean {
  // compares every character, so the time taken does not show how much of the password was right
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function givenPassword(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const given = givenPassword(request);
  if (given !== null && sameText(given, password)) return NextResponse.next();
  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Responsible AI benchmark", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
