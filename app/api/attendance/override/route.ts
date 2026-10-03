import { hasSession, isAdminPasswordConfigured, isValidAdminPassword } from "@/lib/server-auth";
import { isDayOff, isFutureDate, isValidDateKey } from "@/lib/attendance-rules";
import { serverSupabase, serverSupabaseConfigError } from "@/lib/server-supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized() { return Response.json({ error: "Authentication required." }, { status: 401 }); }
function badRequest(message: string) { return Response.json({ error: message }, { status: 400 }); }

export async function POST(request: Request) {
  if (!await hasSession()) return unauthorized();
  if (!isAdminPasswordConfigured()) return Response.json({ error: "ADMIN_PASSWORD is not configured on the server." }, { status: 500 });
  if (!serverSupabase) return Response.json({ error: serverSupabaseConfigError }, { status: 500 });

  const body = await request.json().catch(() => null);
  const employeeId = body?.employeeId;
  const date = body?.date;
  const status = body?.status;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (typeof employeeId !== "string" || !UUID_PATTERN.test(employeeId) || !isValidDateKey(date) || !["present", "absent"].includes(status)) {
    return badRequest("Invalid attendance correction.");
  }
  if (!isValidAdminPassword(body?.adminPassword)) return Response.json({ error: "Incorrect admin password." }, { status: 401 });
  if (reason.length < 1 || reason.length > 1000) return badRequest("A reason of up to 1000 characters is required.");
  if (isFutureDate(date) || isDayOff(date)) return badRequest("This date is not an editable working day.");

  const { data, error } = await serverSupabase.rpc("correct_locked_attendance", {
    p_employee_id: employeeId,
    p_date: date,
    p_new_status: status,
    p_reason: reason,
  });

  if (error) {
    if (error.code === "P0002") return Response.json({ error: "Attendance record not found." }, { status: 404 });
    if (error.code === "P0001") return Response.json({ error: error.message }, { status: 409 });
    console.error("Locked attendance correction failed:", error);
    return Response.json({ error: "Could not save attendance correction." }, { status: 500 });
  }

  return Response.json({ attendance: data });
}