import { hasSession } from "@/lib/server-auth";
import { isAttendanceEditable, isDayOff, isFutureDate, isValidDateKey } from "@/lib/attendance-rules";
import { serverSupabase, serverSupabaseConfigError } from "@/lib/server-supabase";

function unauthorized() { return Response.json({ error: "Authentication required." }, { status: 401 }); }
function badRequest(message: string) { return Response.json({ error: message }, { status: 400 }); }

export async function GET(request: Request) {
  if (!await hasSession()) return unauthorized();
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!isValidDateKey(start) || !isValidDateKey(end)) return badRequest("Valid start and end dates are required.");
  const { data, error } = await serverSupabase.from("attendance").select("employee_id, date, status, updated_at").gte("date", start).lt("date", end);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ attendance: data ?? [] });
}

export async function POST(request: Request) {
  if (!await hasSession()) return unauthorized();
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const body = await request.json().catch(() => null);
  const employeeId = body?.employeeId;
  const date = body?.date;
  const status = body?.status;
  if (typeof employeeId !== "string" || !isValidDateKey(date) || !["present", "absent"].includes(status)) return badRequest("Invalid attendance record.");
  if (isFutureDate(date) || isDayOff(date)) return badRequest("This date is not an editable working day.");

  const { data: existing } = await serverSupabase.from("attendance").select("updated_at").eq("employee_id", employeeId).eq("date", date).maybeSingle();
  if (existing && !isAttendanceEditable(existing.updated_at)) return Response.json({ error: "This attendance cell is locked after 5 minutes." }, { status: 423 });
  const { data, error } = await serverSupabase.from("attendance").upsert({ employee_id: employeeId, date, status, updated_at: new Date().toISOString() }, { onConflict: "employee_id,date" }).select("employee_id, date, status, updated_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ attendance: data });
}

export async function DELETE(request: Request) {
  if (!await hasSession()) return unauthorized();
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });
  const body = await request.json().catch(() => null);
  const employeeId = body?.employeeId;
  const date = body?.date;
  if (typeof employeeId !== "string" || !isValidDateKey(date)) return badRequest("Invalid attendance record.");
  if (isFutureDate(date) || isDayOff(date)) return badRequest("This date is not an editable working day.");
  const { data: existing } = await serverSupabase.from("attendance").select("updated_at").eq("employee_id", employeeId).eq("date", date).maybeSingle();
  if (!existing) return Response.json({ ok: true });
  if (!isAttendanceEditable(existing.updated_at)) return Response.json({ error: "This attendance cell is locked after 5 minutes." }, { status: 423 });
  const { error } = await serverSupabase.from("attendance").delete().eq("employee_id", employeeId).eq("date", date);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
