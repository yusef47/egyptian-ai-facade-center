import type { SupabaseClient } from "@supabase/supabase-js";
import { verifySupabaseUser } from "./credits.js";

/**
 * Server-side authorization gate for the /admin dashboard. Access is limited
 * to the account owner (and any operators declared in the ADMIN_EMAILS env
 * var, comma-separated). Verified against the user's Supabase identity via
 * the service-role client — never from browser-supplied data.
 */

/** Owner account — always authorized. */
const OWNER_ADMIN_EMAIL = "yusefelshater979@gmail.com";

function authorizedAdminEmails(): string[] {
  const extra = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return [OWNER_ADMIN_EMAIL, ...extra];
}

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return authorizedAdminEmails().includes(email.trim().toLowerCase());
}

/** Look up the profile email for a verified user id via the service role. */
async function getProfileEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  return typeof data?.email === "string" ? data.email : null;
}

export type AdminGate =
  | { authorized: true; userId: string }
  | { authorized: false; reason: "unauthenticated" | "forbidden" };

/**
 * Verify the request's Supabase identity and decide whether it may access
 * admin-only data. Returns a 401-style reason for anonymous callers and a
 * 403-style reason for authenticated non-admins.
 */
export async function authorizeAdmin(
  request: Request,
  admin: SupabaseClient,
): Promise<AdminGate> {
  const userId = await verifySupabaseUser(request);
  if (!userId) return { authorized: false, reason: "unauthenticated" };

  // Prefer the authoritative auth email, falling back to the profile row.
  const emailFromAuth = await getAuthEmail(admin, userId);
  const email = emailFromAuth ?? (await getProfileEmail(admin, userId));
  if (isAdminEmail(email)) return { authorized: true, userId };

  return { authorized: false, reason: "forbidden" };
}

async function getAuthEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
