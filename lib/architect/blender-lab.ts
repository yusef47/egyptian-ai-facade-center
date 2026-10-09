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

export async function generateBlenderScript(input: BlenderLabInput, fetchFn: typeof fetch = fetch): Promise<{ script: string; reply: string }> {
  const model = resolveArchitectTextModel();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !apiKey) throw new Error("Text model unavailable");
  const response = await fetchFn(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 8000,
      messages: [
        { role: "system", content: `You are a concept architectural modeller controlling Blender 4.x through bpy. Return ONLY JSON with keys "script" (full executable Python script) and "reply" (short Arabic explanation). Site dimensions are in meters. Create real mesh geometry for spaces, walls, slab, stairs, columns and beams where requested; place objects coherently. On every turn write the COMPLETE scene script, incorporating edits into the previous script. Use bpy and Python standard library only. Never require downloads, external files, add-ons, or rendering. Do not write save/export commands: the host exports GLB. Never claim structural safety or Egyptian code approval; this is an unverified concept model. Keep the script under ${BLENDER_LAB.maxScript} characters.` },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status})`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("Model response exceeds size limit");
  const content = extractChatText(JSON.parse(raw));
  const parsed = content && parseBlenderModelReply(content);
  if (!parsed) throw new Error("Model did not return a usable Blender script");
  return parsed;
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
