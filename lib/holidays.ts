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

function formatApiDate(locdate: number) {
  const raw = String(locdate);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function getApiKey() {
  return process.env.KOREA_HOLIDAY_API_KEY || process.env.PUBLIC_DATA_API_KEY || "";
}

export async function getPublicHolidays(year: number, month: number): Promise<Holiday[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  memory.__companyCarHolidays ??= new Map();
  const cacheKey = `${year}-${String(month).padStart(2, "0")}`;
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
    return [];
  }

  const data = (await response.json()) as HolidayApiResponse;
  const rawItems = data.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const holidays = items
    .filter((item) => item.isHoliday !== "N" && item.locdate)
    .map((item) => ({
      date: formatApiDate(Number(item.locdate)),
      name: item.dateName || "공휴일"
    }));

  memory.__companyCarHolidays.set(cacheKey, holidays);
  return holidays;
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
