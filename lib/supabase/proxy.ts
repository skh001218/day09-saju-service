import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  // Refresh once before server components and route handlers read the session.
  try {
    await supabase.auth.getClaims();
  } catch {
    // A temporary Auth outage should not block public chart calculation.
    // Protected routes verify the claims again before serving private data.
  }
  return response;
}
