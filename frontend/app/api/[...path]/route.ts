import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const pathStr = (resolvedParams.path || []).join("/");
  const searchParams = req.nextUrl.search || "";
  const targetUrl = `${BACKEND_URL}/api/${pathStr}${searchParams}`;

  try {
    const headers = new Headers(req.headers);
    headers.delete("host");

    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const data = await backendRes.arrayBuffer();
    return new NextResponse(data, {
      status: backendRes.status,
      headers: {
        "content-type": backendRes.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: "PROXY_ERROR", message: "Failed to connect to backend server." } },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
