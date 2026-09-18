import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/credits.js";
import { authorizeAdmin } from "../../../../lib/admin.js";
import { isAllowedOrigin } from "../../../../lib/origin.js";
import {
  FALLBACK_OPENROUTER_MODEL,
  OPENROUTER_MODEL,
} from "../../../../lib/openrouter-engine.js";

export const runtime = "nodejs";

/**
 * Engine health probe (admin-only). Sends a MINIMAL text-only completion
 * (max_tokens: 5) to the primary and fallback models and reports the exact
 * HTTP status + upstream error message so the operator can pinpoint a key
 * credit cap, moderation flag, or model-access restriction in one click.
 *
 * Probe cost is negligible (a few output tokens, no image generation) and the
 * route never appears in any user-facing surface. GET is supported so the
 * dashboard can call it with a simple fetch; POST is accepted for parity.
 */

type ProbeOutcome = {
  model: string;
  ok: boolean;
  status: number | null;
  message: string;
  /** Classification shown in the dashboard: ok | auth | credits | forbidden | rate | capacity | unknown */
  classification: string;
};

function classify(status: number, message: string): string {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth";
  if (
    status === 402 ||
    /insufficient.?credits|out of credits|insufficient balance|key limit/i.test(message)
  ) {
    return "credits";
  }
  if (status === 403) return "forbidden";
  if (status === 429) return "rate";
  if (status >= 500) return "capacity";
  return "unknown";
}

async function probeModel(model: string, apiKey: string): Promise<ProbeOutcome> {
  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    let message = "";
    try {
      const data = (await upstream.json()) as { error?: { message?: string } } | null;
      message = data?.error?.message ?? (upstream.ok ? "reachable" : "unreachable");
    } catch {
      message = upstream.ok ? "reachable (non-JSON)" : "unreachable (non-JSON)";
    }
    return {
      model,
      ok: upstream.ok,
      status: upstream.status,
      message: message.slice(0, 300),
      classification: classify(upstream.status, message),
    };
  } catch (error) {
    return {
      model,
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : "network failure",
      classification: "network",
    };
  }
}

async function handle(request: Request): Promise<NextResponse> {
  // CSRF parity with the other admin surface.
  if (!isAllowedOrigin(request)) {
    console.log(
      `[ORIGIN_REJECTED] ${JSON.stringify({ route: "admin/engine-health", origin: request.headers.get("origin") })}`,
    );
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Credit service unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // Same gate as /api/admin/stats and the top-up queue: verified identity
  // against the owner + co-admin allowlist BEFORE any probe runs.
  const gate = await authorizeAdmin(request, admin);
  if (!gate.authorized) {
    return NextResponse.json(
      {
        error:
          gate.reason === "unauthenticated"
            ? "Sign in with Google to run the engine probe."
            : "This dashboard is restricted to Qattan administrators.",
      },
      { status: gate.reason === "unauthenticated" ? 401 : 403 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        checkedAt: new Date().toISOString(),
        probes: [
          {
            model: OPENROUTER_MODEL,
            ok: false,
            status: null,
            message: "OPENROUTER_API_KEY is not configured on the server.",
            classification: "config",
          },
        ],
      },
      { status: 200 },
    );
  }

  const primary = await probeModel(OPENROUTER_MODEL, apiKey);
  const results: ProbeOutcome[] = [primary];
  // Only probe the fallback when the primary failed — saves a call when green.
  if (!primary.ok) {
    results.push(await probeModel(FALLBACK_OPENROUTER_MODEL, apiKey));
  }

  console.log(
    `[ENGINE_HEALTH] ${JSON.stringify({ operator: gate.userId ?? null, primary: primary.classification })}`,
  );

  return NextResponse.json({ checkedAt: new Date().toISOString(), probes: results });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
