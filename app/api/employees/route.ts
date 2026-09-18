import { hasSession } from "@/lib/server-auth";
import { serverSupabase, serverSupabaseConfigError } from "@/lib/server-supabase";

function unauthorized() { return Response.json({ error: "Authentication required." }, { status: 401 }); }

export async function GET() {
  if (!await hasSession()) return unauthorized();
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const { data, error } = await serverSupabase.from("employees").select("id, name, active, sort_order").order("sort_order", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ employees: data ?? [] });
}

export async function POST(request: Request) {
  if (!await hasSession()) return unauthorized();
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const body = await request.json().catch(() => null);
  const { data: last } = await serverSupabase.from("employees").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await serverSupabase.from("employees").insert({ name: String(body?.name ?? "").trim(), active: true, sort_order: (last?.sort_order ?? -1) + 1 }).select("id, name, active, sort_order").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ employee: data });
}

export async function PATCH(request: Request) {
  if (!await hasSession()) return unauthorized();
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const body = await request.json().catch(() => null);
  if (!body?.id || typeof body.active !== "boolean") return Response.json({ error: "Invalid employee update." }, { status: 400 });
  const { error } = await serverSupabase.from("employees").update({ active: body.active }).eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
