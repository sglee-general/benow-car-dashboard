const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function splitYmd(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

export function ymdFromUtcMs(utcMs: number) {
  const date = new Date(utcMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKstYmd(now = new Date()) {
  return ymdFromUtcMs(now.getTime() + KST_OFFSET_MS);
}

export function datesBetween(startYmd: string, endYmd: string) {
  const start = splitYmd(startYmd);
  const end = splitYmd(endYmd);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return [];

  const dates: string[] = [];
  for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
    dates.push(ymdFromUtcMs(cursor));
  }
  return dates;
}

export function isWeekendYmd(ymd: string) {
  const { year, month, day } = splitYmd(ymd);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function lastMondayOfMonthAt10Kst(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  const distanceFromMonday = (lastDow + 6) % 7;
  const mondayDate = lastDay - distanceFromMonday;

  // 10:00 KST is 01:00 UTC on the same date.
  return new Date(Date.UTC(year, month - 1, mondayDate, 1, 0, 0));
}

export function weekendBookingOpenAt(targetYmd: string) {
  const { year, month } = splitYmd(targetYmd);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousMonthYear = month === 1 ? year - 1 : year;
  return lastMondayOfMonthAt10Kst(previousMonthYear, previousMonth);
}

export function isRestrictedBookingDate(targetYmd: string, holidays: Set<string> | string[] = []) {
  const holidaySet = Array.isArray(holidays) ? new Set(holidays) : holidays;
  return isWeekendYmd(targetYmd) || holidaySet.has(targetYmd);
}

export function canReserveDate(targetYmd: string, now = new Date(), holidays: Set<string> | string[] = []) {
  if (!isRestrictedBookingDate(targetYmd, holidays)) return true;
  return now.getTime() >= weekendBookingOpenAt(targetYmd).getTime();
}

export function yearMonthFromYmd(ymd: string) {
  const { year, month } = splitYmd(ymd);
  return { year, month };
}
