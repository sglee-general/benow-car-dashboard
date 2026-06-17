import { NextResponse } from "next/server";
import { getPublicHolidays } from "@/lib/holidays";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year") || now.getFullYear());
  const month = Number(url.searchParams.get("month") || now.getMonth() + 1);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year와 month를 확인해 주세요." }, { status: 400 });
  }

  const holidays = await getPublicHolidays(year, month);

  return NextResponse.json({
    year,
    month,
    holidays,
    env: {
      hasKoreaHolidayApiKey: Boolean(process.env.KOREA_HOLIDAY_API_KEY || process.env.korea_holiday_api_key),
      hasManualHolidays: Boolean(
        process.env.COMPANY_CAR_HOLIDAYS ||
          process.env.COMPANY_CAR_HOLIDAY ||
          process.env.company_car_holidays ||
          process.env.company_car_holiday
      )
    }
  });
}
