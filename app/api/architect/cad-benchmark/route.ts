import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { extractChatText, extractJsonPayload } from "../../../../lib/architect-interpreter";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { OPENROUTER_ENDPOINT } from "../../../../lib/openrouter-engine";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODELS = [
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "moonshotai/kimi-k3",
] as const;

const SYSTEM_PROMPT = `You are a professional architectural CAD planner. Create ONE original, furnished, editable 2D plan from this brief: a 20 m x 20 m plot, one residential floor with exactly two independent apartments A and B; each apartment has exactly three bedrooms, one bathroom, one kitchen, and one reception/living area. Include a shared entrance and a usable shared stair. Your output will be executed by AutoCAD-MCP's arch_plan_from_spec tool and furniture catalogue. You must design the layout yourself; do not repeat a supplied plan.

Return ONLY one JSON object with keys "spec", "furniture", and "selfReview". No Markdown or prose outside JSON.

The coordinate system is millimetres: plot bounds [0,0] to [20000,20000]. Each wall is {"id":"unique","axis":[[x1,y1],[x2,y2]],"thickness":120,"material":"aac"}; an outer wall may use {"id":"EXT","axis":[[0,0],[20000,0],[20000,20000],[0,20000]],"thickness":250,"closed":true,"material":"brick"}. Opening is {"id":"unique","wall":"existing wall id","kind":"door|window","offset":positive distance in mm from start of host wall axis to near jamb,"width":900,"tag":"D01"}. Window openings also have "sill":900,"height":1200. For a closed outer wall, distance continues around its four segments, starting at [0,0]. Keep every opening away from endpoints, wall junctions and other openings by at least 200 mm. Rooms are {"id":"unique","name":"A BEDROOM 1","number":"01","at":[x,y]}; the point must be inside an enclosed room, never on a wall. Stairs are {"id":"S1","start":[x,y],"direction_deg":90,"width":1100,"risers":16,"riser_height":175,"going":280}; stair geometry must fit its dedicated core and not overlap any bathroom or apartment. The spec object must contain "sheet":{"intent":"two apartments on 20 x 20 m plot","sheet_size":"A1","scale":50}, "lang":"en", "walls", "openings", "rooms", "stairs", "chains":{"sides":["bottom","left"]}; omit schedules.

Furniture is an array of {"name":"catalogue item","at":[x,y],"rotation":0}. Allowed items: single_bed, double_bed, wardrobe, sofa_3_seat, armchair, dining_table_4, desk, kitchen_counter, fridge, coffee_table, wc, wall_basin, shower_tray, bathtub, kitchen_sink, washing_machine. The at point is the item's bottom-left anchor. Include a bed and wardrobe in each bedroom; sofas in both receptions; counters and fridges in both kitchens; wc, basin and shower in both bathrooms; dining tables where space permits. Keep furniture inside its intended room and clear of doors and circulation. Rooms must have reachable doors, bathrooms must have privacy, and bedrooms/receptions should have windows. Keep all geometry inside the plot.

Before finalizing, review your own geometry for impossible openings, dead-end access, overlap, stair clearance, missing rooms, furniture collisions, and room/window placement. Put a concise honest checklist in selfReview (array of strings); never claim building-code approval. Do not return Python or code fences.`;

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origin denied" }, { status: 403 });
  const admin = getSupabaseAdminClient();
  if (!admin || !process.env.OPENROUTER_API_KEY?.trim()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await authorizeArchitectPilot(request, admin);
  if (!gate.authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limited = rateLimit(`cad-benchmark:${gate.userId}`);
  if (!limited.allowed) return NextResponse.json({ error: "Wait before the next model call" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const model = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).model : null;
  if (typeof model !== "string" || !MODELS.includes(model as typeof MODELS[number])) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const upstream = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.qattan-ai.com",
        "X-Title": "Qattan CAD Benchmark",
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 16000,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "Produce your best furnished architectural CAD plan now. Check every requested room and the hosted opening offsets before you answer." },
        ],
      }),
      signal: AbortSignal.timeout(240_000),
      cache: "no-store",
    });
    if (!upstream.ok) {
      console.error("[CAD_BENCHMARK_UPSTREAM]", model, upstream.status);
      return NextResponse.json({ error: `Model request failed (${upstream.status})`, model }, { status: 502 });
    }
    const text = await upstream.text();
    if (text.length > 400_000) return NextResponse.json({ error: "Model response too large", model }, { status: 502 });
    const data = JSON.parse(text) as Record<string, unknown>;
    const answer = extractChatText(data);
    const parsed = answer ? extractJsonPayload(answer) : null;
    const choice = Array.isArray(data.choices) ? data.choices[0] as Record<string, unknown> | undefined : undefined;
    const spec = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).spec : null;
    const valid = spec && typeof spec === "object" && !Array.isArray(spec)
      && Array.isArray((spec as Record<string, unknown>).walls)
      && Array.isArray((spec as Record<string, unknown>).openings)
      && Array.isArray((spec as Record<string, unknown>).rooms)
      && Array.isArray((parsed as Record<string, unknown>).furniture);
    return NextResponse.json({
      model,
      elapsedMs: Date.now() - started,
      finishReason: choice?.finish_reason ?? null,
      usage: data.usage ?? null,
      validJson: Boolean(valid),
      output: valid ? parsed : null,
      responseExcerpt: valid ? null : answer?.slice(0, 2000) ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CAD_BENCHMARK_FAILED]", model, error instanceof Error ? error.message.slice(0, 500) : "unknown");
    return NextResponse.json({ error: "Model request timed out or failed", model, elapsedMs: Date.now() - started }, { status: 502 });
  }
}
