import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";
import { getReservations } from "@/lib/reservations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = readSessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const reservations = (await getReservations()).filter((reservation) => reservation.createdByEmail === user.email);
  return NextResponse.json({ reservations });
}
