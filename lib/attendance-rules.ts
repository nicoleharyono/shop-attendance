import "server-only";

import { getHolidayByDate, getIndonesianHolidays } from "@/lib/holidays";

const JAKARTA_OFFSET = "+07:00";

export function isValidDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isSunday(date: string) {
  return new Date(`${date}T00:00:00${JAKARTA_OFFSET}`).getDay() === 0;
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
  return Date.now() - new Date(updatedAt).getTime() < 30 * 60 * 1000;
}
