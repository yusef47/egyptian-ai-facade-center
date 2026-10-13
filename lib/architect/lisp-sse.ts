export type LispSseEvent = { event: string; data: unknown };

/** Incremental decoder for the small JSON event frames emitted by the LISP route. */
export class LispSseParser {
  private buffer = "";
  private eventName = "message";
  private dataLines: string[] = [];

  push(chunk: string): LispSseEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    const events: LispSseEvent[] = [];
    for (const line of lines) this.readLine(line, events);
    return events;
  }

  finish(): LispSseEvent[] {
    const events: LispSseEvent[] = [];
    if (this.buffer) this.readLine(this.buffer, events);
    this.buffer = "";
    this.dispatch(events);
    return events;
  }

  private readLine(line: string, events: LispSseEvent[]) {
    if (line === "") { this.dispatch(events); return; }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") this.eventName = value || "message";
    if (field === "data") this.dataLines.push(value);
  }

  private dispatch(events: LispSseEvent[]) {
    if (this.dataLines.length === 0) { this.eventName = "message"; return; }
    const raw = this.dataLines.join("\n");
    let data: unknown;
    try { data = JSON.parse(raw); } catch { data = raw; }
    events.push({ event: this.eventName, data });
    this.dataLines = [];
    this.eventName = "message";
  }
}
