import { describe, expect, it, vi } from "vitest";
import { buildVillaStages, generateVillaDesign, parseVillaDesign, VILLA_STAGE_LABELS } from "../../lib/architect/villa-live";

function fakeGlb() {
  const buffer = Buffer.alloc(20);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(20, 8);
  return buffer;
}

describe("villa design and genuine Blender stages", () => {
  it("accepts only bounded design choices", () => {
    expect(parseVillaDesign({ style: "warm", poolSide: "left" })).toEqual({ style: "warm", poolSide: "left" });
    expect(parseVillaDesign({ style: "arbitrary-code", poolSide: "left" })).toBeNull();
    expect(parseVillaDesign({ style: "warm", poolSide: "above" })).toBeNull();
  });

  it("uses a model-specified design when the response is valid", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"style":"coastal","poolSide":"right"}' } }] }), { status: 200 }));
      await expect(generateVillaDesign("coastal villa", fakeFetch as unknown as typeof fetch)).resolves.toEqual({ design: { style: "coastal", poolSide: "right" }, source: "model" });
    } finally { vi.unstubAllEnvs(); }
  });

  it("exports four successive GLBs from one sandbox and disables its network", async () => {
    const stages: number[] = [];
    const sandbox = {
      runCommand: vi.fn(async (command: unknown, args?: string[]) => {
        if (command === "blender") stages.push(Number(args?.at(-1)));
        return { exitCode: 0, stderr: async () => "" };
      }),
      writeFiles: vi.fn(async () => {}),
      readFileToBuffer: vi.fn(async () => fakeGlb()),
      update: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const seen = [];
    for await (const stage of buildVillaStages({ style: "warm", poolSide: "left" }, async () => sandbox as never)) seen.push(stage);
    expect(stages).toEqual([1, 2, 3, 4]);
    expect(seen.map((stage) => stage.label)).toEqual([...VILLA_STAGE_LABELS]);
    expect(sandbox.update).toHaveBeenCalledWith({ networkPolicy: "deny-all" });
    expect(sandbox.writeFiles).toHaveBeenCalledOnce();
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it("stops the sandbox if a later stage fails", async () => {
    const sandbox = {
      runCommand: vi.fn(async (command: unknown, args?: string[]) => ({ exitCode: command === "blender" && args?.at(-1) === "2" ? 1 : 0, stderr: async () => "broken scene" })),
      writeFiles: vi.fn(async () => {}),
      readFileToBuffer: vi.fn(async () => fakeGlb()),
      update: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const iterator = buildVillaStages({ style: "warm", poolSide: "left" }, async () => sandbox as never);
    expect((await iterator.next()).value?.stage).toBe(1);
    await expect(iterator.next()).rejects.toThrow("Villa stage 2 failed");
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });
});
