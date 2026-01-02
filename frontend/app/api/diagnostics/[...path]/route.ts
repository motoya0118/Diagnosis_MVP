import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl =
  process.env.BACKEND_INTERNAL_URL ??
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

type MaybePromise<T> = T | Promise<T>;

function buildTargetUrl(pathSegments: string[] | undefined, request: NextRequest): URL {
  const sanitizedBase = backendBaseUrl.endsWith("/") ? backendBaseUrl.slice(0, -1) : backendBaseUrl;
  const joinedPath = (pathSegments ?? []).join("/");
  const normalizedPath = joinedPath ? `/${joinedPath}` : "";
  const target = new URL(`${sanitizedBase}${normalizedPath}`);
  target.search = request.nextUrl.search;
  return target;
}

function forwardRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (hopByHopHeaders.has(lowerKey)) {
      return;
    }
    if (lowerKey === "host") {
      return;
    }
    headers.set(key, value);
  });
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

async function proxyRequest(
  method: string,
  request: NextRequest,
  params: MaybePromise<{ path?: string[] } | undefined>,
): Promise<NextResponse> {
  const resolvedParams = params ? await params : undefined;
  const targetUrl = buildTargetUrl(resolvedParams?.path, request);
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
      headers: forwardRequestHeaders(request),
      body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("diagnostics proxy request failed", {
      target: targetUrl.toString(),
      error,
    });
    return NextResponse.json(
      {
        error: {
          code: "DiagnosticsProxyRequestFailed",
          message: "診断APIとの通信に失敗しました。",
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
