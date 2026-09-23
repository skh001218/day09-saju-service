import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

function returnToHome(request: NextRequest, error?: "cancelled" | "failed") {
  const destination = new URL("/", request.url);
  if (error) destination.searchParams.set("auth_error", error);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const cancelled = request.nextUrl.searchParams.get("error") === "access_denied";
    return returnToHome(request, cancelled ? "cancelled" : "failed");
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return returnToHome(request, "failed");
    return returnToHome(request);
  } catch {
    return returnToHome(request, "failed");
  }
}
