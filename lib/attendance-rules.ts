import "server-only";

import { getHolidayByDate, getIndonesianHolidays } from "@/lib/holidays";

export const ATTENDANCE_LOCK_WINDOW_MS = 30 * 60 * 1000;

export function isValidDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isSunday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

export function isIndonesianHoliday(date: string) {
  const year = Number(date.slice(0, 4));
  return Boolean(getHolidayByDate(getIndonesianHolidays(year), date));
}

export function isDayOff(date: string) {
  return isSunday(date) || isIndonesianHoliday(date);
}

export function isFutureDate(date: string) {
  const jakartaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return date > jakartaToday;
}

export function isAttendanceEditable(updatedAt: string) {
  return Date.now() - new Date(updatedAt).getTime() < ATTENDANCE_LOCK_WINDOW_MS;
}
