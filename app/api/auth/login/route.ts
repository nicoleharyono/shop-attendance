import { setSessionCookie, isPinConfigured, isValidPin } from "@/lib/server-auth";

export async function POST(request: Request) {
  if (!isPinConfigured()) return Response.json({ error: "ATTENDANCE_PIN is not configured on the server." }, { status: 500 });
  const body = await request.json().catch(() => null);
  if (!isValidPin(body?.pin)) return Response.json({ error: "Incorrect PIN." }, { status: 401 });
  await setSessionCookie();
  return Response.json({ authenticated: true });
}
