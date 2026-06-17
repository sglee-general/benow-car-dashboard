import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";
import { canReserveDate, datesBetween, todayKstYmd } from "@/lib/dates";
import { getPublicHolidayDatesForRange, getPublicHolidaysForYears } from "@/lib/holidays";
import { createReservation, getReservations, isCarId } from "@/lib/reservations";
import { sendReservationCompleteMessage } from "@/lib/slack";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value || "").trim();
}

function hasRequiredAgreements(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const agreements = value as Record<string, unknown>;
  return ["trafficLaw", "accidentReport", "prohibitedUse", "reservationRestriction"].every((key) => agreements[key] === true);
}

function parseYears(searchParams: URLSearchParams) {
  const requested = searchParams.getAll("year").flatMap((value) => value.split(","));
  const years = requested.map(Number).filter((year) => Number.isInteger(year) && year >= 2020 && year <= 2100);
  return years.length > 0 ? [...new Set(years)] : [new Date().getFullYear()];
}

export async function GET(request: Request) {
  const user = readSessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const url = new URL(request.url);
  const [reservations, holidays] = await Promise.all([
    getReservations(),
    getPublicHolidaysForYears(parseYears(url.searchParams))
  ]);

  return NextResponse.json({ reservations, holidays });
}

export async function POST(request: Request) {
  try {
    const user = readSessionFromRequest(request);
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json();
    const carId = clean(body.carId);
    const bookerName = clean(body.bookerName);
    const title = clean(body.title);
    const department = clean(body.department);
    const startDate = clean(body.startDate);
    const startTime = clean(body.startTime);
    const endDate = clean(body.endDate);
    const endTime = clean(body.endTime);
    const slackUserId = clean(body.slackUserId) || undefined;

    if (!isCarId(carId)) {
      return NextResponse.json({ error: "차량을 선택해 주세요." }, { status: 400 });
    }

    if (!bookerName || !title || !department || !startDate || !startTime || !endDate || !endTime) {
      return NextResponse.json({ error: "필수 정보를 모두 입력해 주세요." }, { status: 400 });
    }

    if (!hasRequiredAgreements(body.agreements)) {
      return NextResponse.json({ error: "안전 운행 및 이용 규정을 모두 확인해 주세요." }, { status: 400 });
    }

    const dates = datesBetween(startDate, endDate);
    if (dates.length === 0) {
      return NextResponse.json({ error: "예약일자와 반납일자를 확인해 주세요." }, { status: 400 });
    }

    if (`${startDate}${startTime}` >= `${endDate}${endTime}`) {
      return NextResponse.json({ error: "반납일시는 예약 시작 이후로 입력해 주세요." }, { status: 400 });
    }

    if (dates.some((date) => date < todayKstYmd())) {
      return NextResponse.json({ error: "지난 날짜는 예약할 수 없습니다." }, { status: 400 });
    }

    const holidayDates = await getPublicHolidayDatesForRange(startDate, endDate);
    if (dates.some((date) => !canReserveDate(date, new Date(), holidayDates))) {
      return NextResponse.json({ error: "예약이 가능한 시간이 아닙니다." }, { status: 403 });
    }

    const reservation = await createReservation({
      carId,
      bookerName,
      title,
      department,
      startDate,
      startTime,
      endDate,
      endTime,
      slackUserId,
      createdByEmail: user.email,
      createdByName: user.name
    });

    await sendReservationCompleteMessage(reservation).catch((error) => {
      console.error("Slack notification failed", error);
    });

    return NextResponse.json({ reservation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "예약 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
