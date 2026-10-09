import { describe, expect, it, vi } from "vitest";
import { BLENDER_LAB, generateBlenderScript, inspectBlenderScript, parseBlenderLabInput, parseBlenderModelReply, reviewBlenderScript, runBlenderInSandbox } from "../../lib/architect/blender-lab";

describe("Blender Lab input and model contract", () => {
  it("requires finite realistic site dimensions and a bounded instruction", () => {
    expect(parseBlenderLabInput({ instruction: "build", siteWidth: 12, siteDepth: 20 })).toEqual({ instruction: "build", siteWidth: 12, siteDepth: 20, previousScript: undefined });
    expect(parseBlenderLabInput({ instruction: "build", siteWidth: Infinity, siteDepth: 20 })).toBeNull();
    expect(parseBlenderLabInput({ instruction: "", siteWidth: 12, siteDepth: 20 })).toBeNull();
    expect(parseBlenderLabInput({ instruction: "build", siteWidth: 12, siteDepth: 20, previousScript: "x".repeat(BLENDER_LAB.maxPreviousScript + 1) })).toBeNull();
  });

  it("accepts only a complete bounded script and reply", () => {
    expect(parseBlenderModelReply('{"script":"import bpy","reply":"جاهز"}')).toEqual({ script: "import bpy", reply: "جاهز" });
    expect(parseBlenderModelReply('{"script":"","reply":"جاهز"}')).toBeNull();
    expect(parseBlenderModelReply('{"script":"print(1)","reply":""}')).toBeNull();
  });

  it("gives Haiku a larger output budget without spending it on reasoning", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.model).toBe("anthropic/claude-haiku-5.5");
        expect(body.max_tokens).toBe(12000);
        expect(body.reasoning).toEqual({ enabled: false });
        expect(body.response_format).toBeUndefined();
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"script":"import bpy","reply":"جاهز"}' } }] }), { status: 200 });
      });
      await expect(generateBlenderScript({ instruction: "أربع أدوار", siteWidth: 12, siteDepth: 20 }, fetchFn as unknown as typeof fetch))
        .resolves.toEqual({ script: "import bpy", reply: "جاهز" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("detects the half-sized cube and off-wall openings from the live apartment failure", () => {
    const broken = `bpy.ops.mesh.primitive_cube_add(size=1)
o.scale = (w/2, d/2, h/2)
def wall_segment(name, x0, y0, x1, y1, col, openings=()):
    c0 = pos - width/2
wall_segment('A_vz3', 5.0, 9.0, 5.0, 13.0, 'Interior', openings=[(11.0, DOOR_W, 'door')])`;
    expect(inspectBlenderScript(broken)).toEqual([
      expect.stringContaining("halves"),
      expect.stringContaining("A_vz3"),
    ]);
  });

  it("requires a separate corrected model response and rejects a still-broken review", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const broken = "bpy.ops.mesh.primitive_cube_add(size=1)\no.scale = (w/2, d/2, h/2)";
    try {
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        const reviewInput = JSON.parse(body.messages[1].content);
        expect(reviewInput.draft.script).toBe(broken);
        expect(reviewInput.detectedIssues[0]).toContain("Unit-cube scale halves");
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ script: "import bpy\n# corrected", reply: "مخطط مراجع" }) } }] }), { status: 200 });
      });
      const input = { instruction: "two apartments", siteWidth: 20, siteDepth: 20 };
      await expect(reviewBlenderScript(input, { script: broken, reply: "draft" }, fetchFn as unknown as typeof fetch))
        .resolves.toEqual({ script: "import bpy\n# corrected", reply: "مخطط مراجع" });
      const unchanged = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ script: broken, reply: "مخطط مراجع" }) } }] }), { status: 200 }));
      await expect(reviewBlenderScript(input, { script: broken, reply: "draft" }, unchanged as unknown as typeof fetch))
        .rejects.toThrow("still has geometry errors");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("isolated Blender execution", () => {
  function fakeGlb() {
    const buffer = Buffer.alloc(20);
    buffer.write("glTF", 0, "ascii");
    buffer.writeUInt32LE(20, 8);
    return buffer;
  }

  it("blocks network before executing generated Python and always stops the sandbox", async () => {
    const calls: string[] = [];
    const sandbox = {
      runCommand: vi.fn(async (command: unknown) => {
        const cmd = typeof command === "string" ? command : (command as { cmd: string }).cmd;
        calls.push(cmd);
        return { exitCode: 0, stderr: async () => "" };
      }),
      writeFiles: vi.fn(async () => { calls.push("write"); }),
      update: vi.fn(async () => { calls.push("deny"); }),
      readFileToBuffer: vi.fn(async () => fakeGlb()),
      stop: vi.fn(async () => { calls.push("stop"); }),
    };
    const result = await runBlenderInSandbox("import bpy", async () => sandbox as never);
    expect(result).toEqual(fakeGlb());
    expect(calls).toEqual(["which", "write", "deny", "blender", "stop"]);
    expect(sandbox.runCommand).toHaveBeenCalledWith("blender", expect.arrayContaining(["--python-exit-code", "1"]), expect.any(Object));
    expect(sandbox.update).toHaveBeenCalledWith({ networkPolicy: "deny-all" });
    expect(sandbox.writeFiles.mock.calls.length).toBe(1);
  });

  it("stops the sandbox after a failing Blender process", async () => {
    const stop = vi.fn(async () => {});
    const sandbox = {
      runCommand: vi.fn(async (command: unknown) => typeof command === "string" && command === "blender"
        ? { exitCode: 1, stderr: async () => "Python exception" }
        : { exitCode: 0, stderr: async () => "" }),
      writeFiles: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      readFileToBuffer: vi.fn(async () => null),
      stop,
    };
    await expect(runBlenderInSandbox("import bpy", async () => sandbox as never)).rejects.toThrow("Blender execution failed");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("installs the NumPy dependency required by the Blender GLB exporter", async () => {
    const sandbox = {
      runCommand: vi.fn(async (command: unknown) => ({
        exitCode: command === "which" ? 1 : 0,
        stderr: async () => "",
      })),
      writeFiles: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      readFileToBuffer: vi.fn(async () => fakeGlb()),
      stop: vi.fn(async () => {}),
    };
    await runBlenderInSandbox("import bpy", async () => sandbox as never);
    expect(sandbox.runCommand).toHaveBeenCalledWith({
      cmd: "apt-get",
      args: ["install", "-y", "blender", "python3-numpy"],
      sudo: true,
      timeoutMs: 120_000,
    });
    expect(sandbox.update).toHaveBeenCalledWith({ networkPolicy: "deny-all" });
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });
});
