"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import {
  DAILY_CREDITS,
  getSupabaseBrowserClient,
  supabaseEnvConfigured,
} from "../../lib/supabase";
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

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!active) return;
      if (!sessionUser) {
        setUser(null);
        setCredits(null);
        setReady(true);
        return;
      }
      const meta = sessionUser.user_metadata ?? {};
      setUser({
        email: sessionUser.email ?? null,
        fullName:
          (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
        avatarUrl:
          (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined) ?? null,
      });
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", sessionUser.id)
          .maybeSingle();
        if (active) setCredits(typeof profile?.credits === "number" ? profile.credits : null);
      } catch {
        if (active) setCredits(null);
      }
      setReady(true);
    };

    void load();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      active = false;
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
      <span className="qattan-auth-credits" title={L ? `رصيدك اليومي: ${credits ?? DAILY_CREDITS}` : `Daily credits: ${credits ?? DAILY_CREDITS}`}>
        <span className="qattan-auth-credits-gem" aria-hidden="true">◆</span>
        {credits ?? DAILY_CREDITS}
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
