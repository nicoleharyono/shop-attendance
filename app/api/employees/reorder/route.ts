import { hasSession } from "@/lib/server-auth";
import { serverSupabase, serverSupabaseConfigError } from "@/lib/server-supabase";

export async function POST(request: Request) {
  if (!await hasSession()) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const body = await request.json().catch(() => null);
  const updates = Array.isArray(body?.updates) ? body.updates.filter((item: unknown) => item && typeof item === "object" && "id" in item && "sortOrder" in item) : [];
  if (!updates.length) return Response.json({ error: "Invalid reorder request." }, { status: 400 });

  const { data: existing } = await serverSupabase.from("employees").select("id, sort_order").in("id", updates.map((item: { id: string }) => item.id));
  const temporaryBase = Math.max(...(existing ?? []).map((item) => item.sort_order), 0) + updates.length + 100;
  for (const [index, item] of updates.entries()) {
    const { error } = await serverSupabase.from("employees").update({ sort_order: temporaryBase + index }).eq("id", item.id);
    if (error) return Response.json({ error: error.message }, { status: 400 });
  }
  for (const item of updates) {
    const { error } = await serverSupabase.from("employees").update({ sort_order: item.sortOrder }).eq("id", item.id);
    if (error) return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
