import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "../../../../../lib/auth/options";

const backendBaseUrl =
  process.env.ADMIN_BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildTargetUrl(pathSegments: string[] | undefined, request: NextRequest): URL {
  const sanitizedBase = backendBaseUrl.endsWith("/")
    ? backendBaseUrl.slice(0, -1)
    : backendBaseUrl;
  const joinedPath = (pathSegments ?? []).join("/");
  const normalizedPath = joinedPath ? `/${joinedPath}` : "";
  const target = new URL(`${sanitizedBase}${normalizedPath}`);
  target.search = request.nextUrl.search;
  return target;
}

function forwardRequestHeaders(request: NextRequest, accessToken: string): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (hopByHopHeaders.has(lowerKey)) {
      return;
    }
    if (lowerKey === "authorization" || lowerKey === "cookie" || lowerKey === "host") {
      return;
    }
    headers.set(key, value);
  });
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

function filterResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

type RouteParams = {
  path?: string[];
};

async function proxyRequest(method: string, request: NextRequest, params: RouteParams = {}): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const accessToken = (session as { backendAccessToken?: string } | null)?.backendAccessToken ?? null;
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: "Unauthorized", message: "Backend access token is not available in the current session." } },
      { status: 401 },
    );
  }

  const targetUrl = buildTargetUrl(params.path, request);
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      body = arrayBuffer;
    }
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method,
      headers: forwardRequestHeaders(request, accessToken),
      body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("admin proxy request failed", {
      target: targetUrl.toString(),
      error,
    });
    return NextResponse.json(
      {
        error: {
          code: "ProxyRequestFailed",
          message: "バックエンドとの通信に失敗しました。",
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = filterResponseHeaders(backendResponse);
  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: any): Promise<NextResponse> {
  return proxyRequest("GET", request, context?.params);
}

export async function POST(request: NextRequest, context: any): Promise<NextResponse> {
  return proxyRequest("POST", request, context?.params);
}

export async function PUT(request: NextRequest, context: any): Promise<NextResponse> {
  return proxyRequest("PUT", request, context?.params);
}

export async function PATCH(request: NextRequest, context: any): Promise<NextResponse> {
  return proxyRequest("PATCH", request, context?.params);
}

export async function DELETE(request: NextRequest, context: any): Promise<NextResponse> {
  return proxyRequest("DELETE", request, context?.params);
}

export async function HEAD(request: NextRequest, context: any): Promise<NextResponse> {
  return proxyRequest("HEAD", request, context?.params);
}
