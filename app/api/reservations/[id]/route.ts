import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";
import { deleteReservation, getReservationById } from "@/lib/reservations";

export const runtime = "nodejs";

function isAdmin(email: string) {
  return (process.env.COMPANY_CAR_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = readSessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await context.params;
  const reservation = await getReservationById(id);
  if (!reservation) return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });

  if (reservation.createdByEmail !== user.email && !isAdmin(user.email)) {
    return NextResponse.json({ error: "본인 예약만 취소할 수 있습니다." }, { status: 403 });
  }

  await deleteReservation(id);
  return NextResponse.json({ ok: true });
}
