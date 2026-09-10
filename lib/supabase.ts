"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase wiring for Qattan AI. The browser client is created lazily and
 * returns null when the public environment variables are not configured, so
 * the app renders normally (auth UI hidden) until Supabase credentials are
 * set in the deployment environment.
 */

export const DAILY_CREDITS = 10;
/** The daily refresh window in milliseconds (24 hours). */
export const CREDIT_REFRESH_MS = 24 * 60 * 60 * 1000;

export const CREDITS_EXHAUSTED_MESSAGE_EN =
  "You have used all 10 free credits for today. Your credits reset automatically every 24 hours.";
export const CREDITS_EXHAUSTED_MESSAGE_AR =
  "لقد استهلكت الرصيد المجاني اليومي (10). يتجدد رصيدك تلقائياً كل ٢٤ ساعة.";

export function supabaseEnvConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Lazily created browser client; null until Supabase env vars exist. */
export function getSupabaseBrowserClient() {
  if (!supabaseEnvConfigured()) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
  }
  return browserClient;
}
