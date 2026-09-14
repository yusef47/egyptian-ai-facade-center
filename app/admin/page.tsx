"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BadgeCheck, Coins, RefreshCw, ShieldCheck, Users, Wand2, X } from "lucide-react";
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
  topups?: {
    id: string;
    userId: string;
    email: string | null;
    fullName: string | null;
    credits: number;
    amountEgp: number;
    paymentMethod: string;
    receiptUrl: string | null;
    refCode: string;
    createdAt: string | null;
  }[];
  error?: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "signed-out" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AdminStatsPayload };

type TopupRow = NonNullable<AdminStatsPayload["topups"]>[number];

/**
 * Secure Qattan admin stats dashboard (obsidian & gold). Authorization is
 * enforced server-side by /api/admin/stats (owner email + ADMIN_EMAILS);
 * the page only mirrors that decision. Renders the Google sign-in state
 * until an authorized operator session exists.
 */
export default function AdminPage() {
  const supabase = getSupabaseBrowserClient();
  const configured = Boolean(supabase);
  // Without Supabase credentials there is no session to verify and no admin
  // API to call, so say so explicitly instead of spinning on "Verifying…".
  const [state, setState] = useState<LoadState>(
    configured ? { kind: "loading" } : { kind: "unconfigured" },
  );
  const [refreshing, setRefreshing] = useState(false);
  const [topupBusyId, setTopupBusyId] = useState<string | null>(null);
  const [topupNotice, setTopupNotice] = useState<string | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

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

  /** One-tap approve (atomic RPC) / reject on a pending top-up request. */
  const decideTopup = useCallback(
    async (row: TopupRow, action: "approve" | "reject") => {
      if (!supabase || topupBusyId) return;
      setTopupBusyId(row.id);
      setTopupNotice(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setTopupNotice("Session expired — sign in again.");
          return;
        }
        const response = await fetch("/api/admin/topup/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ requestId: row.id, action }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string; creditsRemaining?: number }
          | null;
        if (!response.ok) {
          setTopupNotice(payload?.error ?? "The action failed. Try again.");
          return;
        }
        setTopupNotice(
          action === "approve"
            ? `Approved ${row.refCode} — +${row.credits} credits${typeof payload?.creditsRemaining === "number" ? ` (new balance ${payload.creditsRemaining})` : ""}.`
            : `Rejected ${row.refCode}.`,
        );
        await loadStats();
      } catch {
        setTopupNotice("Network error while updating the request.");
      } finally {
        setTopupBusyId(null);
      }
    },
    [supabase, topupBusyId, loadStats],
  );

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

        {state.kind === "unconfigured" && (
          <section className="qattan-admin-gate" aria-live="polite">
            <ShieldCheck aria-hidden="true" />
            <h2>Not activated</h2>
            <p>
              Supabase credentials are not configured on this deployment, so administrator access
              cannot be verified and no statistics can be loaded.
            </p>
          </section>
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

            <section className="qattan-admin-table-wrap" data-testid="admin-topup-queue">
              <div className="qattan-admin-table-head">
                <h2>Pending top-up requests</h2>
                <span className="qattan-admin-topup-count">
                  {state.data.topups?.length ?? 0}
                </span>
              </div>
              {topupNotice && (
                <p className="qattan-admin-note" role="status">{topupNotice}</p>
              )}
              <div className="qattan-admin-table-scroll">
                <table className="qattan-admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Credits</th>
                      <th>EGP</th>
                      <th>Method</th>
                      <th>Receipt</th>
                      <th>Ref code</th>
                      <th>Date</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.topups?.length ? (
                      state.data.topups.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div>{row.fullName ?? "—"}</div>
                            <div className="qattan-admin-topup-email">{row.email ?? "—"}</div>
                          </td>
                          <td className="qattan-admin-credits-cell">+{row.credits}</td>
                          <td>{row.amountEgp.toLocaleString("en-EG")}</td>
                          <td>{row.paymentMethod === "vodafone_cash" ? "Vodafone Cash" : row.paymentMethod === "instapay" ? "InstaPay" : "Other"}</td>
                          <td>
                            {row.receiptUrl ? (
                              <button
                                type="button"
                                className="qattan-admin-topup-receipt"
                                onClick={() => setPreviewReceipt(row.receiptUrl)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={row.receiptUrl} alt="Receipt screenshot" />
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td dir="ltr" className="qattan-admin-topup-ref">{row.refCode}</td>
                          <td>
                            {row.createdAt
                              ? new Date(row.createdAt).toLocaleString("en-GB")
                              : "—"}
                          </td>
                          <td>
                            <div className="qattan-admin-topup-actions">
                              <button
                                type="button"
                                className="qattan-admin-topup-approve"
                                disabled={topupBusyId === row.id}
                                aria-label={`Approve ${row.refCode}`}
                                onClick={() => void decideTopup(row, "approve")}
                              >
                                <BadgeCheck size={14} aria-hidden="true" /> Approve
                              </button>
                              <button
                                type="button"
                                className="qattan-admin-topup-reject"
                                disabled={topupBusyId === row.id}
                                aria-label={`Reject ${row.refCode}`}
                                onClick={() => void decideTopup(row, "reject")}
                              >
                                <X size={14} aria-hidden="true" /> Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8}>No pending top-up requests.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

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

      {previewReceipt && (
        <div
          className="qattan-admin-receipt-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Receipt screenshot"
          onClick={() => setPreviewReceipt(null)}
        >
          <button
            type="button"
            className="qattan-authgate-close"
            aria-label="Close"
            onClick={() => setPreviewReceipt(null)}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewReceipt} alt="Receipt screenshot" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </main>
  );
}
