import { describe, expect, it } from "vitest";
import {
  RECEIPT_AUDIT_PROMPT,
  RECEIPT_INVALID_BILINGUAL,
  RECEIPT_REPLAY_BILINGUAL,
  hashReceiptImage,
  parseReceiptAuditJson,
} from "../lib/receipt-audit";
import { approveTopupRequest, isReceiptAlreadyUsed } from "../lib/topups";

/** UUID-shaped request id — approveTopupRequest refuses non-UUID ids. */
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Anti-fraud receipt verification — engine-level unit tests. The HTTP-layer
 * integration behavior (422/409/502/instant-grant) lives in
 * tests/qattan-topups.test.tsx; these pin the parsing, hashing, and prompt
 * contracts the route depends on.
 */

describe("Receipt audit verdict parser (Layer 2)", () => {
  it("parses a clean verdict", () => {
    const verdict = parseReceiptAuditJson(
      '{"isValidReceipt": true, "detectedAmount": 250, "confidence": "high", "reason": "InstaPay success screenshot"}',
    );
    expect(verdict).toEqual({
      isValidReceipt: true,
      detectedAmount: 250,
      confidence: "high",
      reason: "InstaPay success screenshot",
    });
  });

  it("parses a verdict wrapped in markdown fences and prose", () => {
    const verdict = parseReceiptAuditJson(
      'Here is my analysis:\n```json\n{"isValidReceipt": false, "detectedAmount": 0, "confidence": "low", "reason": "image is a landscape photo"}\n```\nDone.',
    );
    expect(verdict?.isValidReceipt).toBe(false);
    expect(verdict?.confidence).toBe("low");
  });

  it("fails closed on malformed answers (no JSON, missing confidence, broken JSON)", () => {
    expect(parseReceiptAuditJson("")).toBeNull();
    expect(parseReceiptAuditJson("no structured answer here")).toBeNull();
    expect(parseReceiptAuditJson('{"isValidReceipt": true, "detectedAmount": 5}')).toBeNull();
    expect(parseReceiptAuditJson("{not json at all}")).toBeNull();
    expect(parseReceiptAuditJson(null)).toBeNull();
    expect(parseReceiptAuditJson(42)).toBeNull();
  });

  it("coerces a string detectedAmount into a number", () => {
    const verdict = parseReceiptAuditJson(
      '{"isValidReceipt": true, "detectedAmount": "50", "confidence": "high", "reason": "ok"}',
    );
    expect(verdict?.detectedAmount).toBe(50);
  });

  it("voids the verdict when confidence is not exactly 'high' or 'low' (fail closed)", () => {
    expect(
      parseReceiptAuditJson('{"isValidReceipt": true, "detectedAmount": 5, "confidence": "HIGH", "reason": "shouty"}'),
    ).toBeNull();
    expect(
      parseReceiptAuditJson('{"isValidReceipt": true, "detectedAmount": 5, "confidence": "certain", "reason": "x"}'),
    ).toBeNull();
  });

  it("pins the audit prompt to the Qattan InstaPay recipient and success markers", () => {
    expect(RECEIPT_AUDIT_PROMPT).toContain("ahmedelqattan78@instapay");
    expect(RECEIPT_AUDIT_PROMPT).toContain("Ahmed El Qattan");
    expect(RECEIPT_AUDIT_PROMPT).toContain("تم التحويل بنجاح");
    expect(RECEIPT_AUDIT_PROMPT).toContain("Successful");
    expect(RECEIPT_AUDIT_PROMPT).toContain("isValidReceipt");
    expect(RECEIPT_AUDIT_PROMPT).toContain("confidence");
  });
});

describe("Receipt hashing (Layer 3 anti-replay key)", () => {
  it("produces a stable SHA-256 hex digest regardless of data-url header", () => {
    const a = hashReceiptImage("data:image/png;base64,QUJDREVGRw==");
    const b = hashReceiptImage("data:image/jpeg;base64,QUJDREVGRw==");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different images", () => {
    const a = hashReceiptImage("data:image/png;base64,AAAA");
    const b = hashReceiptImage("data:image/png;base64,BBBB");
    expect(a).not.toBe(b);
  });
});

describe("Anti-replay lookup (lib/topups)", () => {
  /** Minimal chainable client covering .from().select().eq().in().limit(). */
  function adminClient(rows: { id: string }[] | null, dbError: { code?: string; message?: string } | null) {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.limit = () => Promise.resolve({ data: rows, error: dbError });
    return { from: () => builder } as unknown as Parameters<typeof isReceiptAlreadyUsed>[0];
  }

  it("flags a hash that already exists on a pending or approved request", async () => {
    expect(await isReceiptAlreadyUsed(adminClient([{ id: "r1" }], null), "hash")).toBe(true);
  });

  it("passes a hash never seen before", async () => {
    expect(await isReceiptAlreadyUsed(adminClient([], null), "hash")).toBe(false);
  });

  it("returns null on query failure so the route fails closed", async () => {
    expect(
      await isReceiptAlreadyUsed(adminClient(null, { code: "42P01", message: "relation missing" }), "hash"),
    ).toBeNull();
  });
});

describe("Manual admin approval path (approve_topup RPC)", () => {
  function adminClient(scalar: unknown, rpcError: { code?: string; message?: string } | null) {
    return {
      rpc: async (_name: string, _args: unknown) => ({ data: scalar, error: rpcError }),
    } as unknown as Parameters<typeof approveTopupRequest>[0];
  }

  it("credits the buyer atomically when an authorized admin approves", async () => {
    const result = await approveTopupRequest(adminClient(60, null), REQUEST_ID);
    expect(result).toEqual({ ok: true, remaining: 60 });
  });

  it("maps TOPUP_NOT_PENDING to not_pending — a request can never be double-credited", async () => {
    const result = await approveTopupRequest(
      adminClient(null, { code: "P0001", message: "TOPUP_NOT_PENDING" }),
      REQUEST_ID,
    );
    expect(result).toEqual({ ok: false, reason: "not_pending" });
  });

  it("maps infrastructure failures to unavailable", async () => {
    const result = await approveTopupRequest(
      adminClient(null, { code: "XX000", message: "connection refused" }),
      REQUEST_ID,
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses a malformed request id before touching the ledger", async () => {
    const result = await approveTopupRequest(adminClient(60, null), "not-a-uuid");
    expect(result).toEqual({ ok: false, reason: "not_pending" });
  });
});

describe("Bilingual rejection copy", () => {
  it("carries the exact Arabic fraud notices from the brief", () => {
    expect(RECEIPT_INVALID_BILINGUAL).toContain("الصورة المرفوعة ليست إيصال تحويل InstaPay صالح");
    expect(RECEIPT_REPLAY_BILINGUAL).toContain("تم استخدام هذا الإيصال من قبل");
  });
});
