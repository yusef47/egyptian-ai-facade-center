import { describe, expect, it } from "vitest";
import { LispSseParser } from "../../lib/architect/lisp-sse";

describe("LISP SSE parser", () => {
  it("handles split frames, multiple data lines, and heartbeat comments", () => {
    const parser = new LispSseParser();
    expect(parser.push("event: del")).toEqual([]);
    expect(parser.push("ta\ndata: {\"text\":\n")).toEqual([]);
    expect(parser.push("data: \"abc\"}\n: keepalive\n\n")).toEqual([{ event: "delta", data: { text: "abc" } }]);
  });

  it("flushes a final event without a trailing newline", () => {
    const parser = new LispSseParser();
    expect(parser.push("event: complete\ndata: {\"ok\":true}")).toEqual([]);
    expect(parser.finish()).toEqual([{ event: "complete", data: { ok: true } }]);
  });
});
