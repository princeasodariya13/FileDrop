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
    
    if (backendRes.status !== 404) {
      return NextResponse.json(
        body || { success: false, error: { code: "BACKEND_ERROR", message: "Error fetching file." } },
        { status: backendRes.status }
      );
    }
  } catch (e) {
    // Ignore proxy error and proceed to fallback
  }

  return NextResponse.json(
    { success: false, error: { code: "FILE_NOT_FOUND", message: "Invalid 6-digit code or file has expired." } },
    { status: 404 }
  );
}
