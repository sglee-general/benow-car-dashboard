import { yearMonthFromYmd } from "./dates";

export type Holiday = {
  date: string;
  name: string;
};

type HolidayApiItem = {
  dateName?: string;
  locdate?: number;
  isHoliday?: "Y" | "N";
};

type HolidayApiResponse = {
  response?: {
    body?: {
      items?: {
        item?: HolidayApiItem | HolidayApiItem[];
      };
    };
  };
};

const memory = globalThis as typeof globalThis & {
  __companyCarHolidays?: Map<string, Holiday[]>;
};

function getEnvValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function formatApiDate(locdate: number) {
  const raw = String(locdate);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function getApiKey() {
  return getEnvValue([
    "KOREA_HOLIDAY_API_KEY",
    "PUBLIC_DATA_API_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "DATA_GO_KR_API_KEY",
    "korea_holiday_api_key",
    "public_data_api_key"
  ]);
}

function parseManualHolidays() {
  const raw = getManualHolidayEnvValue();
  if (!raw.trim()) return [];

  return raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [date, name] = item.split(/[:=]/).map((value) => value.trim());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
      return { date, name: name || "공휴일" };
    })
    .filter((item): item is Holiday => Boolean(item));
}

function getManualHolidayEnvValue() {
  return getEnvValue([
    "COMPANY_CAR_HOLIDAYS",
    "COMPANY_CAR_HOLIDAY",
    "MANUAL_HOLIDAYS",
    "MANUAL_HOLIDAY",
    "company_car_holidays",
    "company_car_holiday",
    "manual_holidays",
    "manual_holiday"
  ]);
}

function mergeHolidays(...groups: Holiday[][]) {
  const map = new Map<string, Holiday>();
  for (const holiday of groups.flat()) {
    map.set(holiday.date, holiday);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPublicHolidays(year: number, month: number): Promise<Holiday[]> {
  const apiKey = getApiKey();
  const manualHolidayEnvValue = getManualHolidayEnvValue();
  const manualHolidays = parseManualHolidays().filter((holiday) => {
    const [holidayYear, holidayMonth] = holiday.date.split("-").map(Number);
    return holidayYear === year && holidayMonth === month;
  });
  if (!apiKey) return manualHolidays;

  memory.__companyCarHolidays ??= new Map();
  const cacheKey = `${year}-${String(month).padStart(2, "0")}:${apiKey.slice(0, 8)}:${manualHolidayEnvValue}`;
  const cached = memory.__companyCarHolidays.get(cacheKey);
  if (cached) return cached;

  const encodedKey = apiKey.includes("%") ? apiKey : encodeURIComponent(apiKey);
  const params = new URLSearchParams({
    solYear: String(year),
    solMonth: String(month).padStart(2, "0"),
    _type: "json",
    numOfRows: "100"
  });
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${encodedKey}&${params}`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    console.error("Holiday API request failed", response.status);
    return manualHolidays;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    const body = await response.text();
    console.error("Holiday API returned non-JSON response", body.slice(0, 300));
    return manualHolidays;
  }

  let data: HolidayApiResponse;
  try {
    data = (await response.json()) as HolidayApiResponse;
  } catch (error) {
    console.error("Holiday API response parse failed", error);
    return manualHolidays;
  }

  const rawItems = data.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const holidays = items
    .filter((item) => item.isHoliday !== "N" && item.locdate)
    .map((item) => ({
      date: formatApiDate(Number(item.locdate)),
      name: item.dateName || "공휴일"
    }));

  const mergedHolidays = mergeHolidays(holidays, manualHolidays);
  memory.__companyCarHolidays.set(cacheKey, mergedHolidays);
  return mergedHolidays;
}

export async function getPublicHolidayDatesForRange(startYmd: string, endYmd: string) {
  const start = yearMonthFromYmd(startYmd);
  const end = yearMonthFromYmd(endYmd);
  const months: Array<{ year: number; month: number }> = [];

  for (let year = start.year; year <= end.year; year += 1) {
    const fromMonth = year === start.year ? start.month : 1;
    const toMonth = year === end.year ? end.month : 12;
    for (let month = fromMonth; month <= toMonth; month += 1) {
      months.push({ year, month });
    }
  }

  const holidays = (await Promise.all(months.map(({ year, month }) => getPublicHolidays(year, month)))).flat();
  return new Set(holidays.map((holiday) => holiday.date));
}

export async function getPublicHolidaysForYears(years: number[]) {
  const months = years.flatMap((year) => Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1 })));
  return (await Promise.all(months.map(({ year, month }) => getPublicHolidays(year, month)))).flat();
}
