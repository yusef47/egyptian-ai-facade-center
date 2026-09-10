"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Coins, RefreshCw, ShieldCheck, Users, Wand2 } from "lucide-react";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type AdminStatsPayload = {
  configured: boolean;
  stats?: {
    totalUsers: number;
    totalGenerations: number;
    totalCreditsRemaining: number;
    activeUsers: number;
  };
  recent?: {
    id: string;
    email: string | null;
    fullName: string | null;
    credits: number;
    generationsUsed: number;
    lastCreditReset: string | null;
    createdAt: string | null;
  }[];
  error?: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AdminStatsPayload };

/**
 * Secure Qattan admin stats dashboard (obsidian & gold). Authorization is
 * enforced server-side by /api/admin/stats (owner email + ADMIN_EMAILS);
 * the page only mirrors that decision. Renders the Google sign-in state
 * until an authorized operator session exists.
 */
export default function AdminPage() {
  const supabase = getSupabaseBrowserClient();
  const configured = Boolean(supabase);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setState({ kind: "signed-out" });
        return;
      }
      const response = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as AdminStatsPayload | null;
      if (response.status === 401) {
        setState({ kind: "signed-out" });
        return;
      }
      if (response.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      if (!response.ok || !data) {
        setState({
          kind: "error",
          message: data?.error ?? "Admin statistics are unavailable right now.",
        });
        return;
      }
      setState({ kind: "ready", data });
    } catch {
      setState({ kind: "error", message: "Network error while loading admin statistics." });
    } finally {
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    void loadStats();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => void loadStats());
    return () => subscription?.subscription.unsubscribe();
  }, [supabase, loadStats]);

  const statsCards = [
    {
      key: "users",
      label: "Total Registered Users",
      labelAr: "إجمالي المستخدمين المسجلين",
      value: state.kind === "ready" ? state.data.stats?.totalUsers ?? 0 : null,
      icon: Users,
    },
    {
      key: "generations",
      label: "Total Generations",
      labelAr: "إجمالي عمليات التوليد",
      value: state.kind === "ready" ? state.data.stats?.totalGenerations ?? 0 : null,
      icon: Wand2,
    },
    {
      key: "credits",
      label: "Active Credit Balances",
      labelAr: "أرصدة الأرصدة النشطة",
      value: state.kind === "ready" ? state.data.stats?.totalCreditsRemaining ?? 0 : null,
      icon: Coins,
    },
    {
      key: "active",
      label: "Active Users (24h)",
      labelAr: "مستخدمون نشطون (٢٤ ساعة)",
      value: state.kind === "ready" ? state.data.stats?.activeUsers ?? 0 : null,
      icon: Activity,
    },
  ];

  return (
    <main className="qattan-admin" data-testid="admin-dashboard">
      <div className="qattan-admin-inner">
        <header className="qattan-admin-header">
          <div>
            <p className="qattan-admin-eyebrow">
              <ShieldCheck size={14} aria-hidden="true" /> Qattan AI · لوحة التحكم
            </p>
            <h1 className="qattan-admin-title">Admin Stats Dashboard</h1>
          </div>
          <Link className="qattan-admin-back" href="/studio">
            Back to Studio
          </Link>
        </header>

        {state.kind === "loading" && (
          <p className="qattan-admin-note" role="status">
            Verifying access…
          </p>
        )}

        {state.kind === "signed-out" && (
          <section className="qattan-admin-gate" aria-live="polite">
            <ShieldCheck aria-hidden="true" />
            <h2>Restricted area</h2>
            <p>Sign in with Google using an authorized administrator account to continue.</p>
            <button
              type="button"
              className="qattan-auth-google"
              onClick={() =>
                void supabase?.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: `${window.location.origin}/auth/callback?next=%2Fadmin` },
                })
              }
            >
              Login with Google
            </button>
          </section>
        )}

        {state.kind === "forbidden" && (
          <section className="qattan-admin-gate" aria-live="polite">
            <ShieldCheck aria-hidden="true" />
            <h2>Access denied</h2>
            <p>This dashboard is restricted to authorized Qattan administrators.</p>
          </section>
        )}

        {state.kind === "error" && (
          <section className="qattan-admin-gate" aria-live="polite">
            <h2>Statistics unavailable</h2>
            <p>{state.message}</p>
            <button type="button" className="qattan-admin-refresh" onClick={() => void loadStats()}>
              Retry
            </button>
          </section>
        )}

        {state.kind === "ready" && (
          <>
            <div className="qattan-admin-grid" data-testid="admin-stats-grid">
              {statsCards.map((card) => (
                <article className="qattan-admin-card" key={card.key}>
                  <card.icon className="qattan-admin-card-icon" aria-hidden="true" />
                  <p className="qattan-admin-card-value" data-testid={`admin-stat-${card.key}`}>
                    {card.value === null ? "—" : card.value.toLocaleString("en-US")}
                  </p>
                  <p className="qattan-admin-card-label">{card.label}</p>
                  <p className="qattan-admin-card-label-ar" dir="rtl">
                    {card.labelAr}
                  </p>
                </article>
              ))}
            </div>

            {state.data.configured === false && (
              <p className="qattan-admin-note">
                Supabase is not activated yet — metrics will populate once credentials are set and
                the migration is applied.
              </p>
            )}

            <section className="qattan-admin-table-wrap">
              <div className="qattan-admin-table-head">
                <h2>Recent users &amp; credit balances</h2>
                <button
                  type="button"
                  className="qattan-admin-refresh"
                  onClick={() => void loadStats()}
                  disabled={refreshing}
                >
                  <RefreshCw size={14} aria-hidden="true" /> {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              <div className="qattan-admin-table-scroll">
                <table className="qattan-admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Credits</th>
                      <th>Generations</th>
                      <th>Last reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.recent?.length ? (
                      state.data.recent.map((row) => (
                        <tr key={row.id}>
                          <td>{row.fullName ?? "—"}</td>
                          <td>{row.email ?? "—"}</td>
                          <td className="qattan-admin-credits-cell">{row.credits}</td>
                          <td>{row.generationsUsed}</td>
                          <td>
                            {row.lastCreditReset
                              ? new Date(row.lastCreditReset).toLocaleString("en-GB")
                              : "—"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5}>No registered users yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
