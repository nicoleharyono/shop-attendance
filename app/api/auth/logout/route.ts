import { clearSessionCookie } from "@/lib/server-auth";

export async function POST() {
  await clearSessionCookie();
  return Response.json({ authenticated: false });
}
