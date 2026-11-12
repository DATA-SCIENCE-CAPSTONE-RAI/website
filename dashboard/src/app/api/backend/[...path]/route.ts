import { NextResponse, type NextRequest } from "next/server";

/**
 * Forwards /api/backend/<path> to the evaluation backend's local API (`raieval serve`,
 * docs/api.md in the backend repo) at RAIEVAL_API_URL. The browser only talks to this site, so the
 * backend can refuse every browser origin. The backend can spend money on API keys, so this route
 * refuses requests from other web pages (a different Origin) and non-JSON posts.
 */

export const dynamic = "force-dynamic";

function backendUrl(): string {
  return (process.env.RAIEVAL_API_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");
}

function fromAnotherSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

async function forward(request: NextRequest, path: string[], method: "GET" | "POST") {
  if (fromAnotherSite(request)) {
    return NextResponse.json({ detail: "Requests from other sites are not allowed." }, { status: 403 });
  }
  if (method === "POST" && !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ detail: "Send JSON." }, { status: 415 });
  }
  if (path.some((part) => part === ".." || part.includes("/"))) {
    return NextResponse.json({ detail: "Bad path." }, { status: 400 });
  }
  const target = `${backendUrl()}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  try {
    const response = await fetch(target, {
      method,
      headers: method === "POST" ? { "content-type": "application/json" } : undefined,
      body: method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      {
        detail: `The evaluation backend is not reachable at ${backendUrl()}. Start it with \`uv run raieval serve\` in the backend repo.`,
      },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path, "GET");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path, "POST");
}
