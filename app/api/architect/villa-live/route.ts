import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import { buildVillaStages, generateVillaDesign } from "../../../../lib/architect/villa-live";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return Response.json({ error: "Origin denied" }, { status: 403 });
  if (process.env.QATTAN_BLENDER_LAB_ENABLED !== "1") return Response.json({ error: "Not found" }, { status: 404 });
  const limited = rateLimit(`architect-villa:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"}`);
  if (!limited.allowed) return Response.json({ error: "Please wait before trying again" }, { status: 429 });
  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Not found" }, { status: 404 });
  const gate = await authorizeArchitectPilot(request, admin);
  if (!gate.authorized) return Response.json({ error: "Not found" }, { status: 404 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const brief = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>).brief : null;
  if (typeof brief !== "string" || !brief.trim() || brief.length > 500) return Response.json({ error: "Invalid villa brief" }, { status: 400 });

  const encoder = new TextEncoder();
  let open = true;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      send({ type: "status", label: "المساعد بيحدد طابع الفيلا ومكان حمام السباحة" });
      heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
      void (async () => {
        try {
          const { design, source } = await generateVillaDesign(brief.trim());
          send({ type: "design", design, source });
          send({ type: "status", label: "Blender بيجهز الموقع وبيبدأ البناء" });
          for await (const stage of buildVillaStages(design)) {
            if (!open) break;
            send({ type: "stage", ...stage });
          }
          if (open) send({ type: "done" });
        } catch (error) {
          console.error("[VILLA_LIVE_FAILED]", error instanceof Error ? error.message.slice(0, 1200) : "unknown");
          if (open) send({ type: "error", message: "تعذّر إكمال مرحلة Blender. احتفظنا بآخر مجسم ظهر؛ حاول مرة أخرى." });
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          if (open) controller.close();
          open = false;
        }
      })();
    },
    cancel() {
      open = false;
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
