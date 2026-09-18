"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AttendanceStatus = "present" | "absent" | null;
type AttendanceRecord = { status: AttendanceStatus; updatedAt: string };

type Employee = { id: string; name: string; active: boolean; sortOrder: number };
type MenuPosition = { top: number; left: number };
type IndonesianHoliday = { date: string; name: string };

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const ATTENDANCE_LOCK_WINDOW_MS = 5 * 60 * 1000;

function getDateKey(employeeId: string, year: number, month: number, day: number) {
  return `${employeeId}-${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDateOnlyKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getJakartaDateOnlyKey(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const jakartaTodayKey = getJakartaDateOnlyKey();
const jakartaTodayParts = jakartaTodayKey.split("-").map(Number);
const jakartaTodayYear = jakartaTodayParts[0];
const jakartaTodayMonth = jakartaTodayParts[1] - 1;

function shiftMonth(year: number, month: number, amount: number) {
  const date = new Date(year, month + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function cycleStatus(status: AttendanceStatus): AttendanceStatus {
  if (status === null) return "present";
  if (status === "present") return "absent";
  return null;
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.03)] sm:px-4 sm:py-4">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
    <p className={`mt-1 text-xl font-bold sm:mt-2 sm:text-2xl ${tone}`}>{value}</p>
  </div>;
}

function statusStyle(status: AttendanceStatus) {
  if (status === "present") return { label: "✓", className: "bg-emerald-500 text-white shadow-sm" };
  if (status === "absent") return { label: "✕", className: "bg-rose-500 text-white shadow-sm" };
  return { label: "", className: "bg-white text-slate-500 hover:bg-slate-100" };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body as T;
}

export default function Home() {
  const [view, setView] = useState({ year: jakartaTodayYear, month: jakartaTodayMonth });
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingAttendanceKey, setSavingAttendanceKey] = useState<string | null>(null);
  const [employeeMutationId, setEmployeeMutationId] = useState<string | null>(null);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [holidays, setHolidays] = useState<IndonesianHoliday[]>([]);
  const [holidayYear, setHolidayYear] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void apiRequest<{ authenticated: boolean }>("/api/auth/session")
      .then(({ authenticated }) => setAuthStatus(authenticated ? "authenticated" : "unauthenticated"))
      .catch(() => setAuthStatus("unauthenticated"));
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPinError(null);
    try {
      await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
      setPin("");
      setAuthStatus("authenticated");
    } catch (error) {
      setPinError(getErrorMessage(error));
    }
  }

  async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setEmployees([]);
    setAttendance({});
    setAuthStatus("unauthenticated");
  }

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    if (!openMenuId) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [authStatus, openMenuId]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    async function loadEmployees() {
      setIsLoadingEmployees(true);
      try {
        const { employees: data } = await apiRequest<{ employees: Array<{ id: string; name: string; active: boolean; sort_order: number }> }>("/api/employees");
        if (cancelled) return;
        setEmployees((data ?? []).map((employee) => ({
          id: employee.id,
          name: employee.name,
          active: employee.active,
          sortOrder: employee.sort_order,
        })));
      } catch (error: unknown) {
        console.error("Employee loading failed:", error);
        if (!cancelled) {
          const message = getErrorMessage(error);
          setErrorMessage(`Could not load employees: ${message}`);
        }
      } finally {
        if (!cancelled) setIsLoadingEmployees(false);
      }
    }

    void loadEmployees();

    return () => { cancelled = true; };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    void import("@/lib/holidays").then(({ getIndonesianHolidays }) => {
      if (!cancelled) {
        setHolidays(getIndonesianHolidays(view.year));
        setHolidayYear(view.year);
      }
    }).catch((error: unknown) => {
      console.error("Holiday loading failed:", error);
    });

    return () => { cancelled = true; };
  }, [authStatus, view.year]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    async function loadAttendance() {
      const startDate = getDateOnlyKey(view.year, view.month, 1);
      const nextMonth = shiftMonth(view.year, view.month, 1);
      const endDate = getDateOnlyKey(nextMonth.year, nextMonth.month, 1);
      setIsLoadingAttendance(true);
      setAttendance({});

      const { attendance: data } = await apiRequest<{ attendance: Array<{ employee_id: string; date: string; status: AttendanceStatus; updated_at: string }> }>(`/api/attendance?start=${startDate}&end=${endDate}`);
      if (cancelled) return;
      const monthAttendance: Record<string, AttendanceRecord> = {};
      for (const record of data ?? []) {
        if (record.status === "present" || record.status === "absent") {
          monthAttendance[getDateKey(record.employee_id, view.year, view.month, Number(record.date.slice(8, 10)))] = { status: record.status, updatedAt: record.updated_at };
        }
      }
      setAttendance(monthAttendance);
      setIsLoadingAttendance(false);
    }

    void loadAttendance().catch((error: unknown) => {
      if (!cancelled) {
        setErrorMessage(`Could not load attendance: ${getErrorMessage(error)}`);
        setIsLoadingAttendance(false);
      }
    });

    return () => { cancelled = true; };
  }, [authStatus, view]);

  const days = useMemo(() => {
    const total = new Date(view.year, view.month + 1, 0).getDate();
    return Array.from({ length: total }, (_, index) => {
      const day = index + 1;
      const date = new Date(view.year, view.month, day);
      const holiday = holidayYear === view.year
        ? holidays.find((item) => item.date === getDateOnlyKey(view.year, view.month, day))
        : undefined;
      return { day, date, isSunday: new Date(Date.UTC(view.year, view.month, day)).getUTCDay() === 0, holiday };
    });
  }, [holidayYear, holidays, view]);

  const workingDays = days.filter(({ isSunday, holiday }) => !isSunday && !holiday).length;
  const activeEmployees = employees.filter((employee) => employee.active).sort((first, second) => first.sortOrder - second.sortOrder);
  const getAttendance = (employeeId: string, day: number) => attendance[getDateKey(employeeId, view.year, view.month, day)];
  const getStatus = (employeeId: string, day: number) => getAttendance(employeeId, day)?.status ?? null;
  const totalPresent = activeEmployees.reduce((total, employee) => total + days.filter(({ day, isSunday, holiday }) => !isSunday && !holiday && getStatus(employee.id, day) === "present").length, 0);
  const totalAbsent = activeEmployees.reduce((total, employee) => total + days.filter(({ day, isSunday, holiday }) => !isSunday && !holiday && getStatus(employee.id, day) === "absent").length, 0);
  const currentJakartaDateKey = getJakartaDateOnlyKey(currentTime);

  async function toggleAttendance(employeeId: string, day: number) {
    if (savingAttendanceKey) return;
    const key = getDateKey(employeeId, view.year, view.month, day);
    const date = getDateOnlyKey(view.year, view.month, day);
    const nextStatus = cycleStatus(attendance[key]?.status ?? null);
    setSavingAttendanceKey(key);
    setErrorMessage(null);

    try {
      let updatedAt = new Date().toISOString();
      if (nextStatus === null) {
        await apiRequest("/api/attendance", { method: "DELETE", body: JSON.stringify({ employeeId, date }) });
      } else {
        const result = await apiRequest<{ attendance: { status: AttendanceStatus; updated_at: string } }>("/api/attendance", { method: "POST", body: JSON.stringify({ employeeId, date, status: nextStatus }) });
        updatedAt = result.attendance.updated_at;
      }
      setAttendance((previous) => nextStatus === null
        ? Object.fromEntries(Object.entries(previous).filter(([entryKey]) => entryKey !== key))
        : { ...previous, [key]: { status: nextStatus, updatedAt } });
    } catch (error) {
      setErrorMessage(`Could not save attendance: ${getErrorMessage(error)}`);
    } finally {
      setSavingAttendanceKey(null);
    }
  }

  function changeMonth(amount: number) {
    setView((current) => shiftMonth(current.year, current.month, amount));
  }

  async function addEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newEmployeeName.trim();
    if (!name) return;

    const nextSortOrder = employees.reduce((highest, employee) => Math.max(highest, employee.sortOrder), -1) + 1;
    setEmployeeMutationId("adding");
    setErrorMessage(null);
    try {
      const { employee } = await apiRequest<{ employee: { id: string; name: string; active: boolean; sort_order: number } }>("/api/employees", { method: "POST", body: JSON.stringify({ name, sortOrder: nextSortOrder }) });
      setEmployees((current) => [...current, { id: employee.id, name: employee.name, active: employee.active, sortOrder: employee.sort_order }]);
      setNewEmployeeName("");
      setIsAddingEmployee(false);
    } catch (error) {
      setErrorMessage(`Could not add employee: ${getErrorMessage(error)}`);
    } finally {
      setEmployeeMutationId(null);
    }
  }

  async function moveEmployee(employeeId: string, direction: -1 | 1) {
    if (employeeMutationId) return;
    const ordered = employees.filter((employee) => employee.active).sort((first, second) => first.sortOrder - second.sortOrder);
    const index = ordered.findIndex((employee) => employee.id === employeeId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const reordered = [...ordered];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const inactiveSortOrders = new Set(employees.filter((employee) => !employee.active).map((employee) => employee.sortOrder));
    const finalSortOrders: number[] = [];
    let nextSortOrder = 0;
    reordered.forEach(() => {
      while (inactiveSortOrders.has(nextSortOrder)) nextSortOrder += 1;
      finalSortOrders.push(nextSortOrder);
      nextSortOrder += 1;
    });

    setEmployeeMutationId(employeeId);
    setErrorMessage(null);
    try {
      await apiRequest("/api/employees/reorder", { method: "POST", body: JSON.stringify({ updates: reordered.map((employee, employeeIndex) => ({ id: employee.id, sortOrder: finalSortOrders[employeeIndex] })) }) });

      setEmployees((current) => {
        const updatedSortOrders = new Map(reordered.map((employee, employeeIndex) => [employee.id, finalSortOrders[employeeIndex]]));
        return current.map((employee) => updatedSortOrders.has(employee.id)
          ? { ...employee, sortOrder: updatedSortOrders.get(employee.id)! }
          : employee);
      });
      setOpenMenuId(null);
      setMenuPosition(null);
    } catch (error) {
      setErrorMessage(`Could not reorder employees: ${getErrorMessage(error)}`);
    } finally {
      setEmployeeMutationId(null);
    }
  }

  async function deactivateEmployee(employee: Employee) {
    const confirmed = window.confirm(`${employee.name} will be hidden from the attendance table. Their historical attendance will be preserved. Continue?`);
    if (!confirmed || employeeMutationId) return;
    setEmployeeMutationId(employee.id);
    setErrorMessage(null);
    try {
      await apiRequest("/api/employees", { method: "PATCH", body: JSON.stringify({ id: employee.id, active: false }) });
      setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, active: false } : item));
      setOpenMenuId(null);
      setMenuPosition(null);
    } catch (error) {
      setErrorMessage(`Could not deactivate employee: ${getErrorMessage(error)}`);
    } finally {
      setEmployeeMutationId(null);
    }
  }

  if (authStatus === "loading") return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-6"><p className="text-sm text-slate-500">Checking access...</p></main>;
  if (authStatus === "unauthenticated") return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-6"><form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.05)]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">W&amp;W Ban</p><h1 className="mt-2 text-2xl font-bold text-slate-900">Attendance access</h1><p className="mt-2 text-sm text-slate-500">Enter the PIN to continue.</p><input type="password" inputMode="text" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} className="mt-5 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none ring-emerald-500 focus:ring-2" aria-label="Attendance PIN" /><button type="submit" className="mt-3 h-11 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700">Unlock attendance</button>{pinError && <p role="alert" className="mt-3 text-sm text-rose-600">{pinError}</p>}</form></main>;

  const isDateEditable = (day: number, isSunday: boolean, holiday: IndonesianHoliday | undefined, record: AttendanceRecord | undefined) => {
    const date = getDateOnlyKey(view.year, view.month, day);
    const todayKey = currentJakartaDateKey;
    return date <= todayKey && !isSunday && !holiday && (!record || currentTime - new Date(record.updatedAt).getTime() < ATTENDANCE_LOCK_WINDOW_MS);
  };

  return <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#f7f9fc] px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
    <div className="mx-auto min-w-0 max-w-[1500px]">
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">W&amp;W Ban · Tire Shop</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Attendance W&amp;W Ban</h1>
          <p className="mt-2 text-base font-semibold text-slate-600">
            &quot;Jujur dalam Hati, Baik dalam Sikap, Unggul dalam Bekerja&quot;
        </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:self-auto">
          <button aria-label="Previous month" onClick={() => changeMonth(-1)} className="grid h-10 w-10 place-items-center rounded-xl text-xl text-slate-600 transition hover:bg-slate-100">←</button>
          <div className="min-w-[132px] px-1 text-center text-sm font-bold text-slate-800 sm:min-w-[150px] sm:px-2">{monthFormatter.format(new Date(view.year, view.month, 1))}</div>
          <button aria-label="Next month" onClick={() => changeMonth(1)} className="grid h-10 w-10 place-items-center rounded-xl text-xl text-slate-600 transition hover:bg-slate-100">→</button>
        </div>
      </header>

      {errorMessage && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Employees" value={activeEmployees.length} tone="text-slate-800" />
        <SummaryCard label="Working days" value={workingDays} tone="text-slate-800" />
        <SummaryCard label="Total present" value={totalPresent} tone="text-emerald-600" />
        <SummaryCard label="Total absent" value={totalAbsent} tone="text-rose-600" />
      </section>

      <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500">Tap a day to mark present, absent, or clear the record.</p>
          {isAddingEmployee ? <form onSubmit={addEmployee} className="flex gap-2">
            <input autoFocus value={newEmployeeName} onChange={(event) => setNewEmployeeName(event.target.value)} placeholder="Employee name" aria-label="New employee name" className="h-9 w-36 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-emerald-500 focus:ring-2 sm:w-44" />
            <button type="submit" disabled={Boolean(employeeMutationId)} className="rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">{employeeMutationId ? "Adding..." : "Add"}</button>
            <button type="button" onClick={() => { setIsAddingEmployee(false); setNewEmployeeName(""); }} className="rounded-lg px-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </form> : <div className="flex items-center gap-2 self-start sm:self-auto"><button disabled={isLoadingEmployees || Boolean(employeeMutationId)} onClick={() => setIsAddingEmployee(true)} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">+ Add Employee</button><button onClick={() => void logout()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Logout</button></div>}
        </div>
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-max border-collapse">
            <thead><tr>
              <th className="sticky left-0 z-20 min-w-[156px] border-b border-r border-slate-200 bg-white px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:min-w-[220px] sm:px-4 sm:text-xs">Employee name</th>
              {days.map(({ day, date, isSunday, holiday }) => {
                const isToday = !isSunday && !holiday && getDateOnlyKey(view.year, view.month, day) === currentJakartaDateKey;
                return <th key={day} title={holiday?.name} className={`min-w-[58px] border-b border-r border-slate-200 p-1.5 text-center sm:min-w-[62px] sm:p-2 ${holiday ? "bg-rose-100 text-rose-700" : isSunday ? "bg-rose-50 text-rose-600" : isToday ? "bg-emerald-50 text-emerald-700" : "bg-white text-slate-600"}`}>
                  <div className="text-[11px] font-semibold uppercase">{weekdayFormatter.format(date)}</div><div className="mt-1 text-sm font-bold">{day}</div>{holiday ? <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-rose-500">LIBUR</div> : isToday && <div className="mx-auto mt-1 h-1 w-1 rounded-full bg-emerald-500" />}
                </th>;
              })}
              <th className="sticky right-0 z-20 min-w-[82px] border-b border-l border-slate-200 bg-white px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:min-w-[92px] sm:px-3 sm:text-xs">Total ✓</th>
            </tr></thead>
            <tbody>{isLoadingEmployees ? <tr><td colSpan={days.length + 2} className="h-24 text-center text-sm text-slate-500">Loading employees...</td></tr> : activeEmployees.length === 0 ? <tr><td colSpan={days.length + 2} className="h-24 text-center text-sm text-slate-500">No active employees yet.</td></tr> : activeEmployees.map((employee) => {
              const presentDays = days.filter(({ day, isSunday, holiday }) => !isSunday && !holiday && getStatus(employee.id, day) === "present").length;
              const hasFullAttendance = workingDays > 0 && presentDays === workingDays;
              return <tr key={employee.id}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 sm:px-4 sm:py-3 sm:text-sm"><div className="flex items-center justify-between gap-2 sm:gap-3"><span>{employee.name}</span><button ref={openMenuId === employee.id ? menuButtonRef : undefined} aria-label={`Manage ${employee.name}`} disabled={Boolean(employeeMutationId)} onClick={(event) => { if (openMenuId === employee.id) { setOpenMenuId(null); setMenuPosition(null); return; } const bounds = event.currentTarget.getBoundingClientRect(); setOpenMenuId(employee.id); setMenuPosition({ top: bounds.bottom + 4, left: Math.min(Math.max(8, bounds.right - 176), window.innerWidth - 184) }); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50 sm:h-8 sm:w-8">⋯</button></div></td>
                {days.map(({ day, isSunday, holiday }) => {
                  const status = getStatus(employee.id, day);
                  const record = getAttendance(employee.id, day);
                  const canEdit = isDateEditable(day, isSunday, holiday, record);
                  const button = statusStyle(status);
                  return <td key={day} title={holiday?.name} className={`h-12 border-b border-r border-slate-200 text-center sm:h-14 ${holiday ? "bg-rose-100/80" : isSunday ? "bg-rose-50/70" : ""}`}>
                    {isSunday ? <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 sm:text-[11px]">OFF</span> : holiday ? <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500 sm:text-[10px]">LIBUR</span> : <button disabled={isLoadingAttendance || !canEdit || savingAttendanceKey === getDateKey(employee.id, view.year, view.month, day)} aria-label={`${employee.name}, day ${day}: ${status ?? "blank"}`} onClick={() => void toggleAttendance(employee.id, day)} className={`h-10 w-10 rounded-xl text-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${button.className}`}>{button.label}</button>}
                  </td>;
                })}
                <td className="sticky right-0 z-10 border-b border-l border-slate-200 bg-white px-2 text-center"><span className="text-sm font-bold text-emerald-600">{presentDays}{hasFullAttendance && <span className="ml-1" aria-label="Full attendance">⭐</span>}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      {openMenuId && menuPosition && (() => {
        const employee = activeEmployees.find((item) => item.id === openMenuId);
        if (!employee) return null;
        const employeeIndex = activeEmployees.findIndex((item) => item.id === employee.id);
        return createPortal(<div ref={menuRef} className="fixed z-[100] w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-left text-xs font-semibold shadow-xl" style={{ top: menuPosition.top, left: menuPosition.left }}><button disabled={employeeIndex === 0 || Boolean(employeeMutationId)} onClick={() => void moveEmployee(employee.id, -1)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">↑ Move up</button><button disabled={employeeIndex === activeEmployees.length - 1 || Boolean(employeeMutationId)} onClick={() => void moveEmployee(employee.id, 1)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">↓ Move down</button><button disabled={Boolean(employeeMutationId)} onClick={() => void deactivateEmployee(employee)} className="block w-full rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">Deactivate</button></div>, document.body);
      })()}
    </div>
  </main>;
}
