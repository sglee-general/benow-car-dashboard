"use client";

import { CalendarDays, Car, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canReserveDate, datesBetween, isRestrictedBookingDate, isWeekendYmd } from "@/lib/dates";
import type { CarId, Reservation } from "@/lib/reservations";
import type { Holiday } from "@/lib/holidays";

const carFilters = [
  { id: "all", name: "전체" },
  { id: "grandeur", name: "그랜져" },
  { id: "ray", name: "레이" }
] as const;

const carOptions = [
  { id: "grandeur", name: "그랜져" },
  { id: "ray", name: "레이" }
] as const;

const agreementText =
  "본인은 도로교통법을 준수하며 안전한 운행을 하겠습니다. 본인은 차량의 문제 발견 또는 사고 발생 시 해당 차량이 가입된 보험회사에 해당 내용을 접수하고, 필요 시 사고 경위서를 작성하겠습니다. 본인은 음주 운전, 운전 중 흡연, 신청된 목적 이외 운행하는 행위를 하지 않겠습니다. 이를 어길 시 공용 법인차량 예약이 불가함을 확인합니다.";

type Filter = (typeof carFilters)[number]["id"];
type FormState = {
  carId: CarId;
  bookerName: string;
  title: string;
  department: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  agreement: boolean;
};

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yearsForMonth(month: Date) {
  return [...new Set([month.getFullYear(), new Date(month.getFullYear(), month.getMonth() - 1, 1).getFullYear()])];
}

export default function Home() {
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    carId: "grandeur",
    bookerName: "",
    title: "",
    department: "",
    startDate: "",
    startTime: "10:00",
    endDate: "",
    endTime: "18:00",
    agreement: false
  });

  const slackUserId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("slackUserId") || "";
  }, []);

  const holidayMap = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday.name])), [holidays]);
  const holidayDates = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);

  async function loadReservations(targetMonth = month) {
    const years = yearsForMonth(targetMonth).join(",");
    const response = await fetch(`/api/reservations?year=${years}`, { cache: "no-store" });
    const data = await response.json();
    setReservations(data.reservations || []);
    setHolidays(data.holidays || []);
  }

  useEffect(() => {
    loadReservations(month).catch(() => setToast("예약 현황을 불러오지 못했습니다."));
  }, [month]);

  const reservationDates = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of reservations) {
      for (const date of datesBetween(reservation.startDate, reservation.endDate)) {
        if (!map.has(date)) map.set(date, []);
        map.get(date)?.push(reservation);
      }
    }
    return map;
  }, [reservations]);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  function getVisibleReservations(ymd: string) {
    const items = reservationDates.get(ymd) || [];
    if (filter === "all") return items;
    return items.filter((reservation) => reservation.carId === filter);
  }

  function isBooked(ymd: string, carId: CarId) {
    return (reservationDates.get(ymd) || []).some((reservation) => reservation.carId === carId);
  }

  function isBlockedForCurrentFilter(ymd: string) {
    if (filter === "all") return carOptions.every((car) => isBooked(ymd, car.id));
    return isBooked(ymd, filter);
  }

  function firstAvailableCar(ymd: string): CarId | null {
    if (filter !== "all") return isBooked(ymd, filter) ? null : filter;
    return carOptions.find((car) => !isBooked(ymd, car.id))?.id || null;
  }

  function openDate(ymd: string) {
    if (!canReserveDate(ymd, new Date(), holidayDates)) {
      setToast("예약이 가능한 시간이 아닙니다.");
      return;
    }

    const availableCar = firstAvailableCar(ymd);
    if (!availableCar) {
      setToast("이미 예약이 완료된 날짜입니다.");
      return;
    }

    setSelectedDate(ymd);
    setForm((current) => ({
      ...current,
      carId: availableCar,
      startDate: ymd,
      endDate: ymd,
      agreement: false
    }));
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setToast("");

    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, slackUserId })
    });
    const data = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setToast(data.error || "예약 처리 중 오류가 발생했습니다.");
      return;
    }

    setSelectedDate(null);
    setToast("예약이 완료되었습니다.");
    await loadReservations();
  }

  return (
    <main>
      <section className="toolbar">
        <div>
          <p className="eyebrow">전체 캘린더 현황</p>
          <h1>비나우 공용 법인차량 예약</h1>
        </div>
        <div className="month-control" aria-label="월 이동">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="이전 달">
            <ChevronLeft size={18} />
          </button>
          <strong>
            {month.getFullYear()}년 {month.getMonth() + 1}월
          </strong>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="다음 달">
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="filters" aria-label="차량 필터">
        {carFilters.map((item) => (
          <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
            {item.id === "all" ? <CalendarDays size={17} /> : <Car size={17} />}
            {item.name}
          </button>
        ))}
      </section>

      <section className="calendar" aria-label="예약 캘린더">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <div className="weekday" key={day}>
            {day}
          </div>
        ))}
        {calendarDays.map((date) => {
          const ymd = formatYmd(date);
          const outside = date.getMonth() !== month.getMonth();
          const visibleReservations = getVisibleReservations(ymd);
          const blocked = isBlockedForCurrentFilter(ymd);
          const closed = !canReserveDate(ymd, new Date(), holidayDates);
          const restricted = isRestrictedBookingDate(ymd, holidayDates);
          const holidayName = holidayMap.get(ymd);

          return (
            <button
              type="button"
              key={ymd}
              className={`day ${outside ? "outside" : ""} ${blocked ? "booked" : ""} ${closed ? "closed" : ""}`}
              onClick={() => openDate(ymd)}
              disabled={blocked}
            >
              <span className="date-row">
                <span className={`date-number ${isWeekendYmd(ymd) || holidayName ? "holiday" : ""}`}>{date.getDate()}</span>
                {holidayName && <span className="holiday-name">{holidayName}</span>}
              </span>
              <span className="badges">
                {visibleReservations.map((reservation) => (
                  <span className={`badge ${reservation.carId}`} key={`${reservation.id}-${ymd}`}>
                    {reservation.carName} · {reservation.bookerName} / {reservation.department}
                  </span>
                ))}
                {closed && <span className="badge closed-badge">예약 가능 시간 아님</span>}
                {!closed && restricted && <span className="badge open-badge">주말/공휴일 예약 가능</span>}
              </span>
            </button>
          );
        })}
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={() => setToast("")} aria-label="닫기">
            <X size={16} />
          </button>
        </div>
      )}

      {selectedDate && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={submitReservation}>
            <header>
              <div>
                <p className="eyebrow">예약 신청</p>
                <h2>{selectedDate}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedDate(null)} aria-label="취소">
                <X size={18} />
              </button>
            </header>

            <label>
              차량
              <select value={form.carId} onChange={(event) => setForm({ ...form, carId: event.target.value as CarId })}>
                {carOptions.map((car) => (
                  <option key={car.id} value={car.id} disabled={isBooked(form.startDate, car.id)}>
                    {car.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid-two">
              <label>
                이름
                <input value={form.bookerName} onChange={(event) => setForm({ ...form, bookerName: event.target.value })} />
              </label>
              <label>
                직책
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </label>
            </div>

            <label>
              소속
              <input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            </label>

            <div className="grid-two">
              <label>
                예약일자
                <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
              </label>
              <label>
                예약시간
                <input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
              </label>
              <label>
                반납일자
                <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
              </label>
              <label>
                반납시간
                <input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
              </label>
            </div>

            <label className="agreement">
              <input
                type="checkbox"
                checked={form.agreement}
                onChange={(event) => setForm({ ...form, agreement: event.target.checked })}
              />
              <span>{agreementText}</span>
            </label>

            <footer>
              <button type="button" className="secondary" onClick={() => setSelectedDate(null)}>
                <X size={17} /> 취소
              </button>
              <button type="submit" className="primary" disabled={submitting}>
                <Check size={17} /> {submitting ? "처리 중" : "확인"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
