import { Sandbox } from "@vercel/sandbox";
import { extractChatText, extractJsonPayload, resolveArchitectTextModel } from "../architect-interpreter";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";

export const BLENDER_LAB = {
  maxInstruction: 1500,
  maxPreviousScript: 36000,
  maxScript: 36000,
  maxReply: 1000,
  maxGlbBytes: 2_000_000,
  sandboxMs: 225_000,
} as const;

export type BlenderLabInput = {
  instruction: string;
  siteWidth: number;
  siteDepth: number;
  previousScript?: string;
};

export type BlenderLabResult = { script: string; reply: string; glbBase64: string };

export function inspectBlenderScript(script: string): string[] {
  const issues: string[] = [];
  // A Blender unit cube is one metre wide. Halving the intended dimensions
  // here made every wall in the live two-apartment test half its intended size.
  if (/primitive_cube_add\s*\(\s*size\s*=\s*1\b/.test(script) &&
      /\.scale\s*=\s*\(\s*w\s*\/\s*2\s*,\s*d\s*\/\s*2\s*,\s*h\s*\/\s*2\s*\)/.test(script)) {
    issues.push("Unit-cube scale halves the requested wall and slab dimensions; use (w, d, h).");
  }

  // Some scripts express wall openings as offsets from the wall start. Check
  // literal wall calls when this convention is visible; dynamic calls remain
  // the review model's responsibility.
  if (/c0\s*=\s*pos\s*-\s*width\s*\/\s*2/.test(script)) {
    const walls = /wall_segment\(\s*['"]([^'"]+)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*['"][^'"]+['"]\s*,\s*openings\s*=\s*\[([^\]]*)\]/g;
    for (const match of script.matchAll(walls)) {
      const length = Math.hypot(Number(match[4]) - Number(match[2]), Number(match[5]) - Number(match[3]));
      const openings = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(?:([A-Za-z_]\w*)|(-?\d+(?:\.\d+)?))\s*,\s*['"](?:door|window)['"]\s*\)/g;
      for (const opening of match[6].matchAll(openings)) {
        const center = Number(opening[1]);
        const width = opening[3] ? Number(opening[3]) : undefined;
        if (center < 0 || center > length || (width !== undefined && (center - width / 2 < 0 || center + width / 2 > length))) {
          issues.push(`Opening on ${match[1]} lies outside its ${length.toFixed(2)} m wall.`);
        }
      }
    }
  }
  return [...new Set(issues)];
}

const EXPORT_HARNESS = `import bpy
import runpy

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
runpy.run_path('/vercel/sandbox/scene.py', run_name='__main__')
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
if not meshes:
    raise RuntimeError('The script produced no mesh objects')
if len(meshes) > 500:
    raise RuntimeError('Too many mesh objects')
bpy.ops.export_scene.gltf(filepath='/vercel/sandbox/result.glb', export_format='GLB')
`;

export function isBlenderLabEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QATTAN_BLENDER_LAB_ENABLED === "1" && !!resolveArchitectTextModel(env) && !!env.OPENROUTER_API_KEY?.trim();
}

export function parseBlenderLabInput(value: unknown): BlenderLabInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.instruction !== "string" || !data.instruction.trim() || data.instruction.length > BLENDER_LAB.maxInstruction) return null;
  if (typeof data.siteWidth !== "number" || !Number.isFinite(data.siteWidth) || data.siteWidth < 3 || data.siteWidth > 100) return null;
  if (typeof data.siteDepth !== "number" || !Number.isFinite(data.siteDepth) || data.siteDepth < 3 || data.siteDepth > 100) return null;
  if (data.previousScript !== undefined && (typeof data.previousScript !== "string" || data.previousScript.length > BLENDER_LAB.maxPreviousScript)) return null;
  return {
    instruction: data.instruction.trim(),
    siteWidth: data.siteWidth,
    siteDepth: data.siteDepth,
    previousScript: data.previousScript as string | undefined,
  };
}

export function parseBlenderModelReply(text: string): { script: string; reply: string } | null {
  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  if (typeof data.script !== "string" || !data.script.trim() || data.script.length > BLENDER_LAB.maxScript) return null;
  if (typeof data.reply !== "string" || !data.reply.trim() || data.reply.length > BLENDER_LAB.maxReply) return null;
  return { script: data.script, reply: data.reply.trim() };
}

async function requestBlenderScript(
  messages: { role: "system" | "user"; content: string }[],
  fetchFn: typeof fetch,
  temperature: number,
  timeoutMs: number,
): Promise<{ script: string; reply: string }> {
  const model = resolveArchitectTextModel();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !apiKey) throw new Error("Text model unavailable");
  const response = await fetchFn(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: model === "anthropic/claude-haiku-5.5" ? 12000 : 8000,
      ...(model === "anthropic/claude-haiku-5.5" ? { reasoning: { enabled: false } } : {}),
      messages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status})`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("Model response exceeds size limit");
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const content = extractChatText(payload);
  const parsed = content && parseBlenderModelReply(content);
  if (!parsed) {
    const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const decoded = content ? extractJsonPayload(content) : null;
    const fields = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
    throw new Error(`Model did not return a usable Blender script (finish=${String(choice?.finish_reason ?? "missing")}, contentLength=${content?.length ?? 0}, contentType=${typeof message?.content}, scriptLength=${typeof fields?.script === "string" ? fields.script.length : "missing"}, replyLength=${typeof fields?.reply === "string" ? fields.reply.length : "missing"})`);
  }
  return parsed;
}

export async function generateBlenderScript(input: BlenderLabInput, fetchFn: typeof fetch = fetch): Promise<{ script: string; reply: string }> {
  return requestBlenderScript([
    { role: "system", content: `You are a concept architectural modeller controlling Blender 4.x through bpy. Return ONLY JSON with keys "script" (full executable Python script) and "reply" (short Arabic explanation). Site dimensions are in meters. Create real mesh geometry for spaces, walls, slab, stairs, columns and beams where requested; place objects coherently. On every turn write the COMPLETE scene script, incorporating edits into the previous script. Use bpy and Python standard library only. Never require downloads, external files, add-ons, or rendering. Do not write save/export commands: the host exports GLB. Before answering, check the actual cube dimensions, that every door/window lies within its wall, that each required room is enclosed and reachable from its apartment entrance, and that the layout fits the site. A script that merely names rooms or prints a success message is insufficient. Never claim structural safety or Egyptian code approval; this is an unverified concept model. Keep the script under ${BLENDER_LAB.maxScript} characters.` },
    { role: "user", content: JSON.stringify(input) },
  ], fetchFn, 0.25, 110_000);
}

export async function reviewBlenderScript(
  input: BlenderLabInput,
  draft: { script: string; reply: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ script: string; reply: string }> {
  const detectedIssues = inspectBlenderScript(draft.script);
  const reviewed = await requestBlenderScript([
    { role: "system", content: `You are the independent architectural and Blender code reviewer. The draft has NOT been shown to the user. Review it against the user's brief and return ONLY JSON with keys "script" (the complete corrected executable bpy Python scene) and "reply" (a short Arabic description of what the final scene actually contains). Inspect coordinates numerically, not just comments: verify site bounds, actual Blender mesh dimensions and scaling, every wall opening against wall length, door access from each apartment entrance through halls to all required rooms, wall continuity, and required room count. Correct every issue in the full script. Do not claim you checked an image or engineering-code compliance. Use bpy and Python standard library only; no files, downloads, add-ons or save/export commands. Keep script under ${BLENDER_LAB.maxScript} characters.` },
    { role: "user", content: JSON.stringify({ brief: input, draft, detectedIssues }) },
  ], fetchFn, 0, 75_000);
  const remainingIssues = inspectBlenderScript(reviewed.script);
  if (remainingIssues.length) throw new Error(`Reviewed Blender script still has geometry errors: ${remainingIssues.join(" ")}`);
  return reviewed;
}

type SandboxRunner = Pick<Sandbox, "runCommand" | "writeFiles" | "readFileToBuffer" | "update" | "stop">;

export async function runBlenderInSandbox(script: string, create: () => Promise<SandboxRunner> = () => Sandbox.create({
  image: process.env.QATTAN_BLENDER_SANDBOX_IMAGE?.trim() || "vercel/sandbox/universal:latest",
  resources: { vcpus: 4 },
  timeout: BLENDER_LAB.sandboxMs,
  persistent: false,
})): Promise<Buffer> {
  const sandbox = await create();
  try {
    // Setup runs with network access. The generated script never sees app secrets.
    const probe = await sandbox.runCommand("which", ["blender"]);
    if (probe.exitCode !== 0) {
      const update = await sandbox.runCommand({ cmd: "apt-get", args: ["update", "-qq"], sudo: true, timeoutMs: 90_000 });
      if (update.exitCode !== 0) throw new Error("Blender package setup failed");
      const install = await sandbox.runCommand({ cmd: "apt-get", args: ["install", "-y", "blender", "python3-numpy"], sudo: true, timeoutMs: 120_000 });
      if (install.exitCode !== 0) throw new Error("Blender package installation failed");
    }
    await sandbox.writeFiles([
      { path: "/vercel/sandbox/scene.py", content: script },
      { path: "/vercel/sandbox/export.py", content: EXPORT_HARNESS },
    ]);
    await sandbox.update({ networkPolicy: "deny-all" });
    const execution = await sandbox.runCommand("blender", ["--background", "--factory-startup", "--threads", "4", "--python-exit-code", "1", "--python", "/vercel/sandbox/export.py"], { timeoutMs: 90_000 });
    if (execution.exitCode !== 0) {
      const stderr = (await execution.stderr()).slice(-1200);
      throw new Error(`Blender execution failed: ${stderr}`);
    }
    const glb = await sandbox.readFileToBuffer({ path: "/vercel/sandbox/result.glb" });
    if (!glb || glb.length < 20 || glb.toString("ascii", 0, 4) !== "glTF" || glb.readUInt32LE(8) !== glb.length) {
      const stderr = (await execution.stderr()).slice(-800);
      const stdout = (await execution.stdout()).slice(-800);
      throw new Error(`Blender did not export a valid GLB file (bytes=${glb?.length ?? 0}, header=${glb?.subarray(0, 12).toString("hex") ?? "missing"}, stderr=${stderr}, stdout=${stdout})`);
    }
    if (glb.length > BLENDER_LAB.maxGlbBytes) throw new Error("3D model exceeds the pilot download limit");
    return glb;
  } finally {
    await sandbox.stop().catch(() => {});
  }
}
