import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/credits.js", () => ({ verifySupabaseUser: vi.fn() }));

import { authorizeArchitectPilot, isArchitectPilotUser } from "../../lib/admin";
import { verifySupabaseUser } from "../../lib/credits.js";

const request = new Request("https://qattan-ai.com/ar/architect");

function adminWithEmail(email: string) {
  return {
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email } } })) } },
    from: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(verifySupabaseUser).mockResolvedValue("user-1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("private Architect pilot authorization", () => {
  it.each(["yusefelshater979@gmail.com", "archkattan78@gmail.com"])("allows the named owner %s", async (email) => {
    const admin = adminWithEmail(email);
    expect(await isArchitectPilotUser(admin as never, "user-1")).toBe(true);
    expect(await authorizeArchitectPilot(request, admin as never)).toEqual({ authorized: true, userId: "user-1" });
  });

  it("rejects extra dashboard admins and other registered users", async () => {
    vi.stubEnv("ADMIN_EMAILS", "other-admin@example.com");
    const admin = adminWithEmail("other-admin@example.com");
    expect(await isArchitectPilotUser(admin as never, "user-1")).toBe(false);
    expect(await authorizeArchitectPilot(request, admin as never)).toEqual({ authorized: false, reason: "forbidden" });
  });

  it("rejects anonymous visitors", async () => {
    vi.mocked(verifySupabaseUser).mockResolvedValue(null);
    const admin = adminWithEmail("yusefelshater979@gmail.com");
    expect(await authorizeArchitectPilot(request, admin as never)).toEqual({ authorized: false, reason: "unauthenticated" });
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });
});
