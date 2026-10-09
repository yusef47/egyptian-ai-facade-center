import { describe, expect, it, vi } from "vitest";
import { BLENDER_LAB, generateBlenderScript, parseBlenderLabInput, parseBlenderModelReply, runBlenderInSandbox } from "../../lib/architect/blender-lab";

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

  it("gives Haiku a larger output budget and low reasoning effort", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.model).toBe("anthropic/claude-haiku-5.5");
        expect(body.max_tokens).toBe(12000);
        expect(body.reasoning).toEqual({ effort: "low" });
        expect(body.response_format).toBeUndefined();
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"script":"import bpy","reply":"جاهز"}' } }] }), { status: 200 });
      });
      await expect(generateBlenderScript({ instruction: "أربع أدوار", siteWidth: 12, siteDepth: 20 }, fetchFn as unknown as typeof fetch))
        .resolves.toEqual({ script: "import bpy", reply: "جاهز" });
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
