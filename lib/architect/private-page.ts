import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { authorizeArchitectPilot } from "../admin";
import { getSupabaseAdminClient } from "../credits";

/** The Architect experiment is reachable only by an authenticated admin. */
export async function requireArchitectAdminPage(): Promise<void> {
  // Read request headers before environment checks so Next never prerenders
  // an unavailable local build into a permanently static 404 page.
  const cookie = (await headers()).get("cookie");
  const admin = getSupabaseAdminClient();
  if (!admin) notFound();
  const request = new Request("http://localhost/architect", {
    headers: cookie ? { cookie } : undefined,
  });
  const access = await authorizeArchitectPilot(request, admin);
  if (!access.authorized) notFound();
}
