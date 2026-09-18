import Holidays from "date-holidays";

export type IndonesianHoliday = {
  date: string;
  name: string;
};

function toDateKey(date: string) {
  return date.slice(0, 10);
}

export function getIndonesianHolidays(year: number): IndonesianHoliday[] {
  const holidays = new Holidays("ID", {
    languages: ["id", "en"],
    timezone: "Asia/Jakarta",
    types: ["public"],
  });

  const byDate = new Map<string, IndonesianHoliday>();
  for (const holiday of holidays.getHolidays(year, "id")) {
    const date = toDateKey(holiday.date);
    if (!byDate.has(date)) {
      byDate.set(date, { date, name: holiday.name });
    }
  }

  return [...byDate.values()];
}

export function getHolidayByDate(holidays: IndonesianHoliday[], date: string) {
  return holidays.find((holiday) => holiday.date === date);
}
