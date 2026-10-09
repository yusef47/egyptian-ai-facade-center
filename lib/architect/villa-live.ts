import { Sandbox } from "@vercel/sandbox";
import { extractChatText, extractJsonPayload, resolveArchitectTextModel } from "../architect-interpreter";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";
import { VILLA_SCENE_SCRIPT } from "./villa-scene";

export type VillaDesign = { style: "warm" | "minimal" | "coastal"; poolSide: "left" | "right" };
export type VillaStage = { stage: number; label: string; glbBase64: string };
export const VILLA_STAGE_LABELS = ["تجهيز الأرض", "بناء الفيلا والغرف", "تأثيث الغرف", "الجنينة وحمام السباحة"] as const;
const DEFAULT_DESIGN: VillaDesign = { style: "warm", poolSide: "left" };
const MAX_GLB_BYTES = 2_000_000;

export function parseVillaDesign(value: unknown): VillaDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.style !== "warm" && data.style !== "minimal" && data.style !== "coastal") return null;
  if (data.poolSide !== "left" && data.poolSide !== "right") return null;
  return { style: data.style, poolSide: data.poolSide };
}

/** The model chooses a bounded direction; it never supplies executable Python. */
export async function generateVillaDesign(brief: string, fetchFn: typeof fetch = fetch): Promise<{ design: VillaDesign; source: "model" | "fallback" }> {
  const model = resolveArchitectTextModel();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !key) return { design: DEFAULT_DESIGN, source: "fallback" };
  try {
    const response = await fetchFn(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          { role: "system", content: "Choose a visual direction for a one-storey 2-bedroom villa on a 12x20 meter plot, with a front garden and pool. Return only JSON: {\"style\":\"warm|minimal|coastal\",\"poolSide\":\"left|right\"}. Respect the user's preference when it fits. Do not claim engineering approval." },
          { role: "user", content: brief },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok) return { design: DEFAULT_DESIGN, source: "fallback" };
    const raw = await response.text();
    if (raw.length > 10_000) return { design: DEFAULT_DESIGN, source: "fallback" };
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const text = extractChatText(payload);
    const design = text ? parseVillaDesign(extractJsonPayload(text)) : null;
    return design ? { design, source: "model" } : { design: DEFAULT_DESIGN, source: "fallback" };
  } catch {
    return { design: DEFAULT_DESIGN, source: "fallback" };
  }
}

type VillaSandbox = Pick<Sandbox, "runCommand" | "writeFiles" | "readFileToBuffer" | "update" | "stop">;

/** Each yield is a real Blender export from the same saved .blend scene. */
export async function* buildVillaStages(
  design: VillaDesign,
  create: () => Promise<VillaSandbox> = () => Sandbox.create({
    image: process.env.QATTAN_BLENDER_SANDBOX_IMAGE?.trim() || "vercel/sandbox/universal:latest",
    resources: { vcpus: 4 },
    timeout: 250_000,
    persistent: false,
  }),
): AsyncGenerator<VillaStage> {
  const sandbox = await create();
  try {
    const probe = await sandbox.runCommand("which", ["blender"]);
    if (probe.exitCode !== 0) {
      const update = await sandbox.runCommand({ cmd: "apt-get", args: ["update", "-qq"], sudo: true, timeoutMs: 90_000 });
      if (update.exitCode !== 0) throw new Error("Blender setup failed");
      const install = await sandbox.runCommand({ cmd: "apt-get", args: ["install", "-y", "blender", "python3-numpy"], sudo: true, timeoutMs: 120_000 });
      if (install.exitCode !== 0) throw new Error("Blender installation failed");
    }
    await sandbox.writeFiles([
      { path: "/vercel/sandbox/villa-scene.py", content: VILLA_SCENE_SCRIPT },
      { path: "/vercel/sandbox/villa-design.json", content: JSON.stringify(design) },
    ]);
    await sandbox.update({ networkPolicy: "deny-all" });

    for (let stage = 1; stage <= VILLA_STAGE_LABELS.length; stage++) {
      const execution = await sandbox.runCommand("blender", ["--background", "--factory-startup", "--threads", "4", "--python-exit-code", "1", "--python", "/vercel/sandbox/villa-scene.py", "--", String(stage)], { timeoutMs: 70_000 });
      if (execution.exitCode !== 0) {
        const stderr = (await execution.stderr()).slice(-1000);
        throw new Error(`Villa stage ${stage} failed: ${stderr}`);
      }
      const glb = await sandbox.readFileToBuffer({ path: `/vercel/sandbox/villa-stage-${stage}.glb` });
      if (!glb || glb.length < 20 || glb.toString("ascii", 0, 4) !== "glTF" || glb.readUInt32LE(8) !== glb.length) {
        throw new Error(`Villa stage ${stage} did not export valid GLB`);
      }
      if (glb.length > MAX_GLB_BYTES) throw new Error(`Villa stage ${stage} exceeded preview size`);
      yield { stage, label: VILLA_STAGE_LABELS[stage - 1], glbBase64: glb.toString("base64") };
    }
  } finally {
    await sandbox.stop().catch(() => {});
  }
}
