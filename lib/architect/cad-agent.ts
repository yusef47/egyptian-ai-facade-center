import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import sharp from "sharp";
import { extractChatText, extractJsonPayload, resolveArchitectTextModel } from "../architect-interpreter";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";
import { FREECAD_HARNESS } from "./cad-agent-harness";

const PROJECTS = "/vercel/sandbox/cad-projects";
const RUNTIME = "/vercel/sandbox/cad-runtime";
const READY = `${RUNTIME}/ready`;
const IMAGE = "vercel/sandbox/universal:latest";
const FREECAD_URL = "https://github.com/FreeCAD/FreeCAD/releases/download/1.1.3/FreeCAD_1.1.3-Linux-x86_64-py311.AppImage";
const FREECAD_SHA256 = "3a853eb69ee595f779f2255dbf80a765926981d8ff68903cefee4dfb03a8f5ef";

export const CAD_AGENT = { maxBrief: 1500, maxCode: 14000, maxSteps: 4, maxSvg: 500_000 } as const;
export type CadInput = { projectId: string; instruction: string; siteWidth: number; siteDepth: number; step: number; executionError?: string };
export type CadAction = { python: string; summary: string; done: boolean };
export type CadInspection = { ok: boolean; error?: string; objects: { label: string; type: string; layer: string; boundsMm?: number[] }[]; counts: Record<string, number>; warnings: string[]; segments: number; siteMm: number[] };

export function cadAgentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QATTAN_BLENDER_LAB_ENABLED === "1" && !!resolveArchitectTextModel(env) && !!env.OPENROUTER_API_KEY?.trim();
}

export function parseCadInput(raw: unknown): CadInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.projectId !== "string" || !/^[0-9a-f]{24}$/.test(v.projectId)) return null;
  if (typeof v.instruction !== "string" || !v.instruction.trim() || v.instruction.length > CAD_AGENT.maxBrief) return null;
  if (typeof v.siteWidth !== "number" || !Number.isFinite(v.siteWidth) || v.siteWidth < 3 || v.siteWidth > 100) return null;
  if (typeof v.siteDepth !== "number" || !Number.isFinite(v.siteDepth) || v.siteDepth < 3 || v.siteDepth > 100) return null;
  if (!Number.isInteger(v.step) || (v.step as number) < 0 || (v.step as number) >= CAD_AGENT.maxSteps) return null;
  if (v.executionError !== undefined && (typeof v.executionError !== "string" || v.executionError.length > 1500)) return null;
  return { projectId: v.projectId, instruction: v.instruction.trim(), siteWidth: v.siteWidth, siteDepth: v.siteDepth, step: v.step as number, executionError: v.executionError as string | undefined };
}

export function parseCadAction(text: string): CadAction | null {
  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (typeof value.python !== "string" || !value.python.trim() || value.python.length > CAD_AGENT.maxCode) return null;
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 500) return null;
  if (typeof value.done !== "boolean") return null;
  return { python: value.python, summary: value.summary.trim(), done: value.done };
}

export function sandboxName(userId: string): string {
  return `qattan-cad-${createHash("sha256").update(userId).digest("hex").slice(0, 22)}`;
}

function projectRoot(projectId: string): string {
  if (!/^[0-9a-f]{24}$/.test(projectId)) throw new Error("Invalid CAD project ID");
  return `${PROJECTS}/${projectId}`;
}

export async function getCadSandbox(userId: string): Promise<Sandbox> {
  return Sandbox.getOrCreate({
    name: sandboxName(userId), image: IMAGE, timeout: 900_000,
    resources: { vcpus: 4 }, persistent: true, keepLastSnapshots: { count: 1 },
  });
}

const SETUP_SCRIPT = `#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="${RUNTIME}"
trap 'echo "FreeCAD setup failed; see setup.log" > "$ROOT/error"; rm -f "$ROOT/installing"' ERR
mkdir -p "$ROOT"
if [ -f "$ROOT/ready" ]; then rm -f "$ROOT/installing"; exit 0; fi
echo "Downloading official FreeCAD 1.1.3 AppImage" > "$ROOT/setup.log"
curl --fail --location --retry 2 --silent --show-error "${FREECAD_URL}" -o "$ROOT/FreeCAD.AppImage" 2>>"$ROOT/setup.log"
echo "${FREECAD_SHA256}  $ROOT/FreeCAD.AppImage" | sha256sum -c - >>"$ROOT/setup.log" 2>&1
chmod +x "$ROOT/FreeCAD.AppImage"
cd "$ROOT"
"$ROOT/FreeCAD.AppImage" --appimage-extract >>"$ROOT/setup.log" 2>&1
mv "$ROOT/squashfs-root" "$ROOT/freecad"
cat > "$ROOT/smoke.py" <<'PY'
import FreeCAD as App
import Part
import os
doc = App.newDocument('CadSmoke')
obj = doc.addObject('Part::Feature', 'Smoke')
obj.Shape = Part.makeLine(App.Vector(0, 0, 0), App.Vector(1000, 0, 0))
doc.recompute()
if len(obj.Shape.Edges) != 1: raise RuntimeError('FreeCAD geometry kernel did not run')
open('/vercel/sandbox/cad-runtime/smoke-ok','w').write('ok')
App.closeDocument(doc.Name)
PY
"$ROOT/freecad/AppRun" --console "$ROOT/smoke.py" >>"$ROOT/setup.log" 2>&1
test -f "$ROOT/smoke-ok"
rm -f "$ROOT/FreeCAD.AppImage" "$ROOT/installing" "$ROOT/error"
touch "$ROOT/ready"
`;

export async function setupCadSandbox(sandbox: Sandbox): Promise<"ready" | "installing" | "error"> {
  const status = await sandbox.runCommand("bash", ["-lc", `if [ -f ${READY} ]; then echo ready; elif [ -f ${RUNTIME}/error ]; then echo error; elif [ -f ${RUNTIME}/installing ]; then age=$(($(date +%s)-$(stat -c %Y ${RUNTIME}/installing))); if [ "$age" -gt 630 ]; then echo error; else echo installing; fi; else echo new; fi`]);
  const state = (await status.stdout()).trim();
  if (state === "ready" || state === "installing" || state === "error") return state;
  await sandbox.runCommand("mkdir", ["-p", RUNTIME]);
  await sandbox.writeFiles([{ path: `${RUNTIME}/setup.sh`, content: SETUP_SCRIPT }]);
  await sandbox.runCommand("touch", [`${RUNTIME}/installing`]);
  await sandbox.runCommand({ cmd: "bash", args: [`${RUNTIME}/setup.sh`], detached: true, timeoutMs: 600_000 });
  return "installing";
}

export async function retryCadSetup(sandbox: Sandbox): Promise<void> {
  await sandbox.runCommand("rm", ["-f", `${RUNTIME}/error`, `${RUNTIME}/installing`]);
}

export async function readCadInspection(sandbox: Sandbox, projectId: string): Promise<{ inspection: CadInspection | null; preview: string | null }> {
  const root = projectRoot(projectId);
  try {
    const [raw, svg] = await Promise.all([
      sandbox.readFileToBuffer({ path: `${root}/result.json` }),
      sandbox.readFileToBuffer({ path: `${root}/plan.svg` }),
    ]);
    if (!raw || !svg) return { inspection: null, preview: null };
    const inspection = JSON.parse(raw.toString("utf8")) as CadInspection;
    const preview = svg.length <= CAD_AGENT.maxSvg ? svg.toString("utf8") : null;
    return { inspection: inspection.ok ? inspection : null, preview };
  } catch { return { inspection: null, preview: null }; }
}

export async function proposeCadAction(input: CadInput, inspection: CadInspection | null, preview: string | null, fetchFn: typeof fetch = fetch): Promise<CadAction> {
  const model = resolveArchitectTextModel();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !key) throw new Error("CAD text model unavailable");
  const description = JSON.stringify({
    userBrief: input.instruction, siteMeters: [input.siteWidth, input.siteDepth], step: input.step + 1,
    maxSteps: CAD_AGENT.maxSteps, executionError: input.executionError,
    currentDrawing: inspection ? { counts: inspection.counts, warnings: inspection.warnings, objects: inspection.objects.slice(0, 75), segments: inspection.segments } : null,
  });
  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [{ type: "text", text: description }];
  if (preview) {
    const png = await sharp(Buffer.from(preview)).resize({ width: 900, height: 900, fit: "inside" }).png().toBuffer();
    content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });
  }
  const response = await fetchFn(OPENROUTER_ENDPOINT, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 12000, reasoning: { enabled: false }, messages: [
      { role: "system", content: `You are an autonomous architectural CAD operator. You control a REAL FreeCAD 1.1 document through an incremental Python tool call. Return ONLY JSON: {"python":"full Python action for THIS step","summary":"brief Arabic description of completed intended work","done":boolean}. The host opens the existing FCStd as variable doc; App, Part, Vector, add_label(text-name, text, x_mm, y_mm), SITE_WIDTH_MM and SITE_DEPTH_MM are available. All coordinates are MILLIMETERS: a 20m lot is 20000mm. Use doc.addObject('Part::Feature', 'WALL_Name') and set Shape to Part.makePolygon([Vector(x,y,0),...]); set Label prefixes SITE_, WALL_, DOOR_, WINDOW_, STAIR_, FURNITURE_, DIMENSION_, COLUMN_ so CAD layers can be inspected. You may use the broader FreeCAD and Part Python APIs to create/edit any geometry. If currentDrawing exists, EDIT and enrich the existing document; never duplicate its site or existing walls. Otherwise create the site and coherent spatial partitions first. On later steps use the supplied actual document inspection and CAD preview IMAGE to correct and enrich doors, windows, furniture, stairs and annotations. Draw actual geometry, not fake labels. Do not erase the whole document unless the user explicitly requested a new project. Do not write files, make network calls, or export: the host saves FCStd and exports editable DXF. Before returning, inspect your coordinates: site bounds, wall gaps, reachable doors, room sizes, collisions. Prefer small coherent additions over a single huge script. Set done=true only when the brief is satisfied and the drawing has architectural detail. A successful Python run is not proof of architectural compliance. Never claim Egyptian code approval. No Markdown.` },
      { role: "user", content },
    ] }),
    signal: AbortSignal.timeout(75_000),
  });
  if (!response.ok) throw new Error(`CAD model request failed (${response.status})`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("CAD model response too large");
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const answer = extractChatText(payload);
  const action = answer && parseCadAction(answer);
  if (!action) {
    const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const decoded = answer ? extractJsonPayload(answer) : null;
    const fields = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
    throw new Error(`CAD model returned no executable action (finish=${String(choice?.finish_reason ?? "missing")}, contentLength=${answer?.length ?? 0}, contentType=${typeof message?.content}, pythonLength=${typeof fields?.python === "string" ? fields.python.length : "missing"}, summaryLength=${typeof fields?.summary === "string" ? fields.summary.length : "missing"}, doneType=${typeof fields?.done})`);
  }
  return action;
}

export async function runCadAction(sandbox: Sandbox, input: CadInput, action: CadAction): Promise<{ inspection: CadInspection; preview: string }> {
  const root = projectRoot(input.projectId);
  await sandbox.runCommand("mkdir", ["-p", root]);
  await sandbox.writeFiles([
    { path: `${root}/harness.py`, content: FREECAD_HARNESS },
    { path: `${root}/action.py`, content: action.python },
    { path: `${root}/site.json`, content: JSON.stringify({ width: input.siteWidth, depth: input.siteDepth }) },
  ]);
  await sandbox.update({ networkPolicy: "deny-all" });
  const cmd = await sandbox.runCommand({ cmd: `${RUNTIME}/freecad/AppRun`, args: ["--console", `${root}/harness.py`], env: { QATTAN_CAD_PROJECT_ROOT: root }, timeoutMs: 45_000 });
  const [raw, preview] = await Promise.all([
    sandbox.readFileToBuffer({ path: `${root}/result.json` }).catch(() => null),
    sandbox.readFileToBuffer({ path: `${root}/plan.svg` }).catch(() => null),
  ]);
  const inspection = raw?.length ? JSON.parse(raw.toString("utf8")) as CadInspection : null;
  if (cmd.exitCode !== 0 || !inspection?.ok) {
    const stderr = (await cmd.stderr()).slice(-900);
    throw new Error(`FreeCAD action failed: ${inspection?.error ?? stderr ?? "unknown"}`);
  }
  if (!preview?.length || preview.length > CAD_AGENT.maxSvg) throw new Error("FreeCAD preview unavailable or too large");
  return { inspection, preview: preview.toString("utf8") };
}

export async function readCadDownload(sandbox: Sandbox, projectId: string, kind: "fcstd" | "dxf"): Promise<Buffer> {
  const root = projectRoot(projectId);
  const file = kind === "fcstd" ? `${root}/project.FCStd` : `${root}/plan.dxf`;
  const content = await sandbox.readFileToBuffer({ path: file });
  if (!content) throw new Error("CAD project file missing");
  return content;
}
