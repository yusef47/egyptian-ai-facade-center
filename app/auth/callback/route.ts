import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth callback for Google sign-in. Exchanges the auth code for a session
 * cookie and redirects the user back where they started. No-op redirect when
 * Supabase env vars are absent (integration not yet activated).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/studio";

  if (!url || !anon || !code) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    await supabase.auth.exchangeCodeForSession(code);
  } catch {
    return NextResponse.redirect(`${origin}/studio`);
  }
  return response;
}
