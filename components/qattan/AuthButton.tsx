"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import {
  DAILY_CREDITS,
  getSupabaseBrowserClient,
  supabaseEnvConfigured,
} from "../../lib/supabase";
import { QATTAN_CREDITS_EVENT } from "../../client/src/lib/restore";
import { useQattan } from "./QattanProviders";

type SessionUser = {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

/**
 * Google sign-in button / signed-in user chip. Renders nothing until Supabase
 * is configured, so the platform ships cleanly before credentials are set.
 */
export default function AuthButton() {
  const { locale } = useQattan();
  const L = locale === "ar";
  const supabase = getSupabaseBrowserClient();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;

    /**
     * Authoritative read of the user's balance. The returned number is applied
     * verbatim — 0 renders as 0. Only a genuinely absent row can lead to the
     * 10-credit allowance; every other failure stays UNKNOWN, because inventing
     * 10 is precisely how a 0-balance account appeared to hold 10.
     */
    const readProfileCredits = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .single();

      if (!error && typeof data?.credits === "number" && Number.isFinite(data.credits)) {
        console.log("[CREDITS_DB_READ]", { userId, credits: data.credits });
        return { ok: true as const, credits: data.credits };
      }

      // PostgREST PGRST116 = "JSON object requested, 0 (or many) rows returned".
      // A missing row means the DB trigger has not created the profile yet.
      if (error?.code === "PGRST116") {
        console.log("[CREDITS_PROFILE_MISSING]", { userId });
        return { ok: false as const, missingRow: true };
      }

      // Denied / offline / malformed payload: report UNKNOWN. Showing 10 here
      // is exactly the bug this guards against (a 0-balance user would see 10).
      console.log("[CREDITS_DB_READ_FAILED]", {
        userId,
        code: error?.code ?? null,
        message: error?.message ?? "no numeric credits in payload",
      });
      return { ok: false as const, missingRow: false };
    };

    /** One cheap retry absorbs a transient blip without hiding the badge. */
    const syncCredits = async (userId: string) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let result: Awaited<ReturnType<typeof readProfileCredits>> | null = null;
        try {
          result = await readProfileCredits(userId);
        } catch (error) {
          console.log("[CREDITS_DB_READ_THREW]", error);
        }
        if (!active) return;
        if (result?.ok) {
          setCredits(result.credits);
          return;
        }
        if (result?.missingRow) {
          // First-time signup with no row yet: show the documented onboarding
          // allowance, but never overwrite a balance the API response has
          // already reported as authoritative.
          setCredits((prev) => (prev === null ? DAILY_CREDITS : prev));
          return;
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
        if (!active) return;
      }
      // A failed read leaves the badge on its last known value — never 10.
    };

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!active) return;
      if (!sessionUser) {
        userIdRef.current = null;
        setUser(null);
        setCredits(null);
        setReady(true);
        return;
      }
      userIdRef.current = sessionUser.id;
      const meta = sessionUser.user_metadata ?? {};
      setUser({
        email: sessionUser.email ?? null,
        fullName:
          (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
        avatarUrl:
          (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined) ?? null,
      });
      await syncCredits(sessionUser.id);
      setReady(true);
    };

    void load();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => void load());

    // After each generation /api/restore broadcasts the authoritative new
    // balance. Apply it IMMEDIATELY (the badge must drop 10 → 9 without any
    // refresh), then reconcile against the database as a background safety net.
    const onCreditsEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const next =
        typeof detail === "number"
          ? detail
          : typeof detail === "object" && detail !== null && "credits" in detail
            ? Number((detail as { credits?: unknown }).credits)
            : Number.NaN;
      console.log("[CREDITS_EVENT_RECEIVED]", detail);
      if (!Number.isFinite(next)) return;
      setCredits(next);
      const id = userIdRef.current;
      if (id) void syncCredits(id);
    };
    window.addEventListener(QATTAN_CREDITS_EVENT, onCreditsEvent);

    return () => {
      active = false;
      window.removeEventListener(QATTAN_CREDITS_EVENT, onCreditsEvent);
      subscription?.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!ready || !supabaseEnvConfigured() || !supabase) return null;

  if (!user) {
    return (
      <button type="button" className="qattan-auth-google" onClick={() => void supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            window.location.pathname,
          )}`,
        },
      })}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5.1L1.2 17C3.2 21.1 7.3 24 12 24z" />
          <path fill="#FBBC05" d="M5.1 14.2c-.3-.7-.4-1.5-.4-2.2s.1-1.5.4-2.2L1.2 6.9C.4 8.5 0 10.2 0 12s.4 3.5 1.2 5.1l3.9-2.9z" />
          <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.9 1.2 6.9l3.9 2.9c1-2.9 3.7-5.1 6.9-5.1z" />
        </svg>
        {L ? "الدخول بحساب Google" : "Login with Google"}
      </button>
    );
  }

  return (
    <div className="qattan-auth-user">
      <span
        className="qattan-auth-credits"
        title={
          credits === null
            ? L
              ? "جارٍ تحميل الرصيد…"
              : "Loading balance…"
            : L
              ? `رصيدك اليومي: ${credits}`
              : `Daily credits: ${credits}`
        }
        data-credits-known={credits === null ? "false" : "true"}
      >
        <span className="qattan-auth-credits-gem" aria-hidden="true">◆</span>
        {credits === null ? "—" : credits}
      </span>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="qattan-auth-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="qattan-auth-avatar qattan-auth-avatar-fallback" aria-hidden="true">
          {(user.fullName ?? user.email ?? "Q").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="qattan-auth-name">{user.fullName ?? user.email}</span>
      <button
        type="button"
        className="qattan-auth-signout"
        aria-label={L ? "تسجيل الخروج" : "Sign out"}
        onClick={() => void supabase.auth.signOut()}
      >
        <LogOut size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
