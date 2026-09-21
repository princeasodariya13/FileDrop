import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = await params;
  const rawCode = resolvedParams.code;

  if (!rawCode || typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode.trim())) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_CODE", message: "Please enter a valid 6-digit code." } },
      { status: 400 }
    );
  }

  const code = rawCode.trim();

  // 1. Try proxying to Express backend
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/files/code/${code}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const body = await backendRes.json().catch(() => null);

    if (backendRes.ok && body?.success) {
      return NextResponse.json(body);
    }
    
    if (body && body.error) {
      return NextResponse.json(body, { status: backendRes.status });
    }
  } catch (e) {
    // Ignore proxy error and proceed to fallback
  }

  return NextResponse.json(
    { success: false, error: { code: "INCORRECT_CODE", message: "Incorrect 6-digit code. Please check your code and try again." } },
    { status: 404 }
  );
}
