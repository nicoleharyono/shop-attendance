import { hasSession } from "@/lib/server-auth";

export async function GET() {
  return Response.json({ authenticated: await hasSession() });
}
