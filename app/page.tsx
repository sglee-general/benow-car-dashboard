"use client";

import { useEffect, useMemo, useState } from "react";

type Vehicle = "ALL" | "GRANDEUR" | "RAY";

type Reservation = {
  id: string;
  vehicle: Exclude<Vehicle, "ALL">;
  applicantName: string;
  positionTitle: string;
  department: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  createdAt: string;
};

const STORAGE_KEY = "bnow-company-car-reservations-v1";

const VEHICLE_OPTIONS: Array<{ value: Exclude<Vehicle, "ALL">; label: string }> = [
  { value: "GRANDEUR", label: "그랜져" },
  { value: "RAY", label: "레이" },
];

const TERMS_TEXT =
  "본인은 도로교통법을 준수하며 안전한 운행을 하겠습니다. 본인은 차량의 문제 발견 또는 사고 발생 시 해당 차량이 가입된 보험회사에 해당 내용을 접수하고, 필요 시 사고 경위서를 작성하겠습니다. 본인은 음주 운전, 운전 중 흡연, 신청된 목적 이외 운행하는 행위를 하지 않겠습니다. 이를 어길 시 공용 법인차량 예약이 불가함을 확인합니다.";

function vehicleLabel(vehicle: Vehicle) {
  if (vehicle === "ALL") return "전체";
  if (vehicle === "GRANDEUR") return "그랜져";
  return "레이";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * 서버/브라우저의 타임존 차이로 날짜가 밀리지 않도록
 * 이 대시보드의 날짜 계산은 한국시간 기준으로 처리합니다.
 */
function nowInKorea() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    )
  );
}

function todayDateString() {
  const now = nowInKorea();
  return formatDate(now);
}

function dateFromString(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatKoreanDate(dateString: string) {
  const date = dateFromString(dateString);
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

function getMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getMonthEnd(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function buildCalendarCells(month: Date) {
  const monthStart = getMonthStart(month);
  const monthEnd = getMonthEnd(month);
  const cells: Array<{ date: string; inCurrentMonth: boolean }> = [];

  const leadingCount = monthStart.getUTCDay();

  for (let i = leadingCount; i > 0; i -= 1) {
    const date = new Date(monthStart);
    date.setUTCDate(monthStart.getUTCDate() - i);
    cells.push({ date: formatDate(date), inCurrentMonth: false });
  }

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
    cells.push({ date: formatDate(date), inCurrentMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const date = new Date(monthEnd);
    date.setUTCDate(monthEnd.getUTCDate() + (cells.length % 7));
    cells.push({ date: formatDate(date), inCurrentMonth: false });
  }

  return cells;
}

function isWeekend(dateString: string) {
  const day = dateFromString(dateString).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * 주말 예약 오픈 기준:
 * 예약 대상 월의 전월 마지막 월요일 오전 10시
 *
 * 예: 2026년 6월 주말 사용분
 * → 2026년 5월 마지막 월요일 오전 10시부터 예약 가능
 */
function getWeekendReservationOpenTime(dateString: string) {
  const targetDate = dateFromString(dateString);
  const year = targetDate.getUTCFullYear();
  const targetMonth = targetDate.getUTCMonth();

  const previousMonthLastDay = new Date(Date.UTC(year, targetMonth, 0, 10, 0, 0));

  while (previousMonthLastDay.getUTCDay() !== 1) {
    previousMonthLastDay.setUTCDate(previousMonthLastDay.getUTCDate() - 1);
  }

  return previousMonthLastDay;
}

function isPastDate(dateString: string) {
  return dateFromString(dateString).getTime() < dateFromString(todayDateString()).getTime();
}

function checkReservationOpen(dateString: string) {
  if (isPastDate(dateString)) {
    return {
      ok: false,
      message: "지난 날짜는 예약할 수 없습니다.",
    };
  }

  if (!isWeekend(dateString)) {
    return {
      ok: true,
      message: "",
    };
  }

  const openTime = getWeekendReservationOpenTime(dateString);
  const now = nowInKorea();

  if (now.getTime() < openTime.getTime()) {
    return {
      ok: false,
      message: `예약이 가능한 시간이 아닙니다. ${formatKoreanDate(formatDate(openTime))} 오전 10시부터 예약할 수 있습니다.`,
    };
  }

  return {
    ok: true,
    message: "",
  };
}

function getDatesBetween(startDate: string, endDate: string) {
  const result: string[] = [];
  const cursor = dateFromString(startDate);
  const end = dateFromString(endDate);

  while (cursor.getTime() <= end.getTime()) {
    result.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function isDateInReservation(dateString: string, reservation: Reservation) {
  return reservation.startDate <= dateString && reservation.endDate >= dateString;
}

function getReservationsForDate(reservations: Reservation[], dateString: string) {
  return reservations.filter((reservation) => isDateInReservation(dateString, reservation));
}

function hasVehicleConflict(
  reservations: Reservation[],
  vehicle: Exclude<Vehicle, "ALL">,
  startDate: string,
  endDate: string
) {
  return reservations.some((reservation) => {
    if (reservation.vehicle !== vehicle) return false;
    return reservation.startDate <= endDate && reservation.endDate >= startDate;
  });
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadReservations() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Reservation[];
  } catch {
    return [];
  }
}

function saveReservations(reservations: Reservation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
}

export default function HomePage() {
  const [selectedView, setSelectedView] = useState<Vehicle>("ALL");
  const [currentMonth, setCurrentMonth] = useState(() => getMonthStart(nowInKorea()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState("");

  const [form, setForm] = useState({
    vehicle: "GRANDEUR" as Exclude<Vehicle, "ALL">,
    applicantName: "",
    positionTitle: "",
    department: "",
    startDate: todayDateString(),
    startTime: "09:00",
    endDate: todayDateString(),
    endTime: "18:00",
    termsAccepted: false,
  });

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  useEffect(() => {
    setReservations(loadReservations());
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => {
      setToast("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentMonthTitle = `${currentMonth.getUTCFullYear()}년 ${currentMonth.getUTCMonth() + 1}월`;

  const stats = useMemo(() => {
    const all = new Set<string>();
    const grandeur = new Set<string>();
    const ray = new Set<string>();

    reservations.forEach((reservation) => {
      getDatesBetween(reservation.startDate, reservation.endDate).forEach((dateString) => {
        all.add(dateString);

        if (reservation.vehicle === "GRANDEUR") {
          grandeur.add(dateString);
        }

        if (reservation.vehicle === "RAY") {
          ray.add(dateString);
        }
      });
    });

    return {
      all: all.size,
      grandeur: grandeur.size,
      ray: ray.size,
    };
  }, [reservations]);

  function getVisibleReservationsForDate(dateString: string) {
    const dayReservations = getReservationsForDate(reservations, dateString);

    if (selectedView === "ALL") {
      return dayReservations;
    }

    return dayReservations.filter((reservation) => reservation.vehicle === selectedView);
  }

  function findFirstAvailableVehicle(dateString: string) {
    const dayReservations = getReservationsForDate(reservations, dateString);
    const reservedVehicles = new Set(dayReservations.map((reservation) => reservation.vehicle));

    return VEHICLE_OPTIONS.find((vehicle) => !reservedVehicles.has(vehicle.value))?.value ?? "GRANDEUR";
  }

  function openReservationForm(dateString: string) {
    const openCheck = checkReservationOpen(dateString);

    if (!openCheck.ok) {
      alert(openCheck.message);
      return;
    }

    const availableVehicle = selectedView === "ALL" ? findFirstAvailableVehicle(dateString) : selectedView;

    if (hasVehicleConflict(reservations, availableVehicle, dateString, dateString)) {
      alert("이미 예약이 완료된 날짜입니다.");
      return;
    }

    setForm((previous) => ({
      ...previous,
      vehicle: availableVehicle,
      startDate: dateString,
      endDate: dateString,
      startTime: "09:00",
      endTime: "18:00",
      termsAccepted: false,
    }));

    setIsModalOpen(true);
  }

  function validateForm() {
    if (!form.applicantName.trim()) return "이름을 입력해주세요.";
    if (!form.positionTitle.trim()) return "직책을 입력해주세요.";
    if (!form.department.trim()) return "소속을 입력해주세요.";
    if (!form.startDate) return "예약일자를 선택해주세요.";
    if (!form.endDate) return "반납일자를 선택해주세요.";

    if (dateFromString(form.endDate).getTime() < dateFromString(form.startDate).getTime()) {
      return "반납일자는 예약일자보다 빠를 수 없습니다.";
    }

    const requestedDates = getDatesBetween(form.startDate, form.endDate);

    if (requestedDates.length > 14) {
      return "한 번에 최대 14일까지만 예약할 수 있습니다.";
    }

    for (const dateString of requestedDates) {
      const openCheck = checkReservationOpen(dateString);

      if (!openCheck.ok) {
        return openCheck.message;
      }
    }

    if (hasVehicleConflict(reservations, form.vehicle, form.startDate, form.endDate)) {
      return "선택한 차량에 이미 예약된 날짜가 포함되어 있습니다.";
    }

    if (!form.termsAccepted) {
      return "안전운행 및 차량 이용 확인사항에 동의해야 예약할 수 있습니다.";
    }

    return "";
  }

  function completeReservation() {
    const errorMessage = validateForm();

    if (errorMessage) {
      alert(errorMessage);
      return;
    }

    const newReservation: Reservation = {
      id: createId(),
      vehicle: form.vehicle,
      applicantName: form.applicantName.trim(),
      positionTitle: form.positionTitle.trim(),
      department: form.department.trim(),
      startDate: form.startDate,
      startTime: form.startTime,
      endDate: form.endDate,
      endTime: form.endTime,
      createdAt: new Date().toISOString(),
    };

    const nextReservations = [...reservations, newReservation].sort((a, b) => {
      if (a.startDate === b.startDate) return a.vehicle.localeCompare(b.vehicle);
      return a.startDate.localeCompare(b.startDate);
    });

    setReservations(nextReservations);
    saveReservations(nextReservations);
    setIsModalOpen(false);
    setToast("예약이 완료되었습니다.");
  }

  function clearAllReservations() {
    const confirmed = window.confirm(
      "현재 브라우저에 저장된 예약 데이터를 모두 삭제할까요? 실제 운영 DB 연결 전 테스트용 기능입니다."
    );

    if (!confirmed) return;

    setReservations([]);
    saveReservations([]);
    setToast("테스트 예약 데이터가 삭제되었습니다.");
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">BNOW COMPANY CAR RESERVATION</p>
          <h1>비나우 공용 법인차량 예약</h1>
          <p className="subtitle">
            전체 예약 현황과 차량별 예약 현황을 한 화면에서 확인하고, 날짜를 클릭해 예약할 수 있습니다.
          </p>
        </div>

        <div className="heroCard">
          <span>현재 보기</span>
          <strong>{vehicleLabel(selectedView)}</strong>
        </div>
      </section>

      <section className="ruleBox">
        <div>
          <strong>예약 규칙</strong>
          <p>
            평일 예약은 상시 가능하며, 주말 예약은 사용월의 전월 마지막 월요일 오전 10시부터 가능합니다.
          </p>
        </div>
        <button onClick={clearAllReservations}>테스트 데이터 초기화</button>
      </section>

      <section className="statsGrid">
        <button className="statCard" onClick={() => setSelectedView("ALL")}>
          <span>전체 예약일</span>
          <strong>{stats.all}</strong>
        </button>
        <button className="statCard" onClick={() => setSelectedView("GRANDEUR")}>
          <span>그랜져 예약일</span>
          <strong>{stats.grandeur}</strong>
        </button>
        <button className="statCard" onClick={() => setSelectedView("RAY")}>
          <span>레이 예약일</span>
          <strong>{stats.ray}</strong>
        </button>
      </section>

      <section className="toolbar">
        <div className="tabs" aria-label="차량별 캘린더 보기">
          {(["ALL", "GRANDEUR", "RAY"] as Vehicle[]).map((vehicle) => (
            <button
              key={vehicle}
              className={selectedView === vehicle ? "active" : ""}
              onClick={() => setSelectedView(vehicle)}
            >
              {vehicleLabel(vehicle)}
            </button>
          ))}
        </div>

        <div className="monthControl">
          <button onClick={() => setCurrentMonth((previous) => addMonths(previous, -1))}>
            이전
          </button>
          <strong>{currentMonthTitle}</strong>
          <button onClick={() => setCurrentMonth((previous) => addMonths(previous, 1))}>
            다음
          </button>
        </div>
      </section>

      <section className="calendarPanel">
        <div className="weekHeader">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="calendarGrid">
          {calendarCells.map((cell) => {
            const visibleReservations = getVisibleReservationsForDate(cell.date);
            const dayReservations = getReservationsForDate(reservations, cell.date);
            const openCheck = checkReservationOpen(cell.date);

            const isToday = cell.date === todayDateString();
            const currentVehicleReserved =
              selectedView !== "ALL" &&
              dayReservations.some((reservation) => reservation.vehicle === selectedView);
            const allVehiclesReserved = dayReservations.length >= VEHICLE_OPTIONS.length;
            const reservedClass =
              selectedView === "ALL" ? allVehiclesReserved : currentVehicleReserved;

            return (
              <button
                key={cell.date}
                className={[
                  "dateCell",
                  !cell.inCurrentMonth ? "otherMonth" : "",
                  isToday ? "today" : "",
                  !openCheck.ok ? "locked" : "",
                  reservedClass ? "reserved" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => openReservationForm(cell.date)}
              >
                <div className="dateTop">
                  <span>{Number(cell.date.slice(-2))}</span>
                  {!openCheck.ok && cell.inCurrentMonth ? <em>예약불가</em> : null}
                </div>

                <div className="reservationBadges">
                  {visibleReservations.map((reservation) => (
                    <span
                      className={`reservationBadge ${reservation.vehicle.toLowerCase()}`}
                      key={reservation.id}
                      title={`${vehicleLabel(reservation.vehicle)} / ${reservation.applicantName} / ${reservation.department}`}
                    >
                      {selectedView === "ALL" ? `${vehicleLabel(reservation.vehicle)} · ` : ""}
                      {reservation.applicantName} · {reservation.department}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="legend">
        <span>
          <i className="legendReserved" />
          예약 완료
        </span>
        <span>
          <i className="legendLocked" />
          예약 가능 시간 아님
        </span>
        <span>
          <i className="legendToday" />
          오늘
        </span>
      </section>

      {reservations.length > 0 && (
        <section className="listPanel">
          <div className="sectionTitle">
            <p className="eyebrow">Reservation List</p>
            <h2>예약 상세 현황</h2>
          </div>

          <div className="reservationList">
            {reservations
              .filter((reservation) => {
                if (selectedView === "ALL") return true;
                return reservation.vehicle === selectedView;
              })
              .map((reservation) => (
                <article className="reservationItem" key={reservation.id}>
                  <strong>{vehicleLabel(reservation.vehicle)}</strong>
                  <p>
                    {reservation.startDate} {reservation.startTime} ~ {reservation.endDate}{" "}
                    {reservation.endTime}
                  </p>
                  <span>
                    {reservation.applicantName} / {reservation.positionTitle} /{" "}
                    {reservation.department}
                  </span>
                </article>
              ))}
          </div>
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}

      {isModalOpen && (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Reservation Form</p>
                <h2>법인차량 예약</h2>
              </div>
              <button className="closeButton" onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="formGrid">
              <label>
                차량
                <select
                  value={form.vehicle}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      vehicle: event.target.value as Exclude<Vehicle, "ALL">,
                    }))
                  }
                >
                  {VEHICLE_OPTIONS.map((vehicle) => (
                    <option value={vehicle.value} key={vehicle.value}>
                      {vehicle.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                이름
                <input
                  value={form.applicantName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      applicantName: event.target.value,
                    }))
                  }
                  placeholder="홍길동"
                />
              </label>

              <label>
                직책
                <input
                  value={form.positionTitle}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      positionTitle: event.target.value,
                    }))
                  }
                  placeholder="매니저"
                />
              </label>

              <label>
                소속
                <input
                  value={form.department}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      department: event.target.value,
                    }))
                  }
                  placeholder="사업지원팀"
                />
              </label>

              <label>
                예약일자
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                예약시간
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      startTime: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                반납일자
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                반납시간
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      endTime: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="terms">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    termsAccepted: event.target.checked,
                  }))
                }
              />
              <span>{TERMS_TEXT}</span>
            </label>

            <div className="modalActions">
              <button className="cancelButton" onClick={() => setIsModalOpen(false)}>
                취소
              </button>
              <button className="confirmButton" onClick={completeReservation}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
          padding: 42px 0 80px;
        }

        .hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          margin-bottom: 20px;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: var(--purple);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: -0.04em;
        }

        h1 {
          font-size: clamp(34px, 5vw, 54px);
          line-height: 1.05;
        }

        h2 {
          font-size: 26px;
        }

        .subtitle {
          max-width: 680px;
          margin: 14px 0 0;
          color: var(--subtext);
          font-size: 16px;
          line-height: 1.7;
        }

        .heroCard {
          min-width: 180px;
          border: 1px solid rgba(255, 255, 255, 0.72);
          border-radius: 26px;
          padding: 22px;
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.1);
          backdrop-filter: blur(16px);
        }

        .heroCard span {
          display: block;
          margin-bottom: 8px;
          color: var(--subtext);
          font-size: 13px;
          font-weight: 700;
        }

        .heroCard strong {
          font-size: 28px;
          letter-spacing: -0.04em;
        }

        .ruleBox {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
          margin-bottom: 16px;
          border: 1px solid #e0e7ff;
          border-radius: 24px;
          padding: 16px 18px;
          background: rgba(238, 242, 255, 0.86);
        }

        .ruleBox strong {
          font-size: 15px;
        }

        .ruleBox p {
          margin: 5px 0 0;
          color: #4338ca;
          line-height: 1.6;
        }

        .ruleBox button {
          flex: 0 0 auto;
          border: 0;
          border-radius: 14px;
          padding: 11px 14px;
          color: #3730a3;
          background: #ffffff;
          font-weight: 900;
          cursor: pointer;
        }

        .statsGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 16px;
        }

        .statCard {
          border: 1px solid var(--line);
          border-radius: 22px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.88);
          text-align: left;
          cursor: pointer;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
        }

        .statCard span {
          display: block;
          margin-bottom: 10px;
          color: var(--subtext);
          font-size: 13px;
          font-weight: 800;
        }

        .statCard strong {
          font-size: 34px;
          letter-spacing: -0.05em;
        }

        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          border: 1px solid var(--line);
          border-radius: 24px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.86);
          backdrop-filter: blur(16px);
        }

        .tabs,
        .monthControl {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tabs button,
        .monthControl button {
          border: 0;
          border-radius: 14px;
          padding: 10px 15px;
          background: transparent;
          color: var(--subtext);
          font-weight: 900;
          cursor: pointer;
        }

        .tabs button.active {
          color: #ffffff;
          background: var(--black);
          box-shadow: 0 10px 24px rgba(17, 24, 39, 0.18);
        }

        .monthControl strong {
          min-width: 120px;
          text-align: center;
          font-size: 16px;
        }

        .calendarPanel {
          border: 1px solid var(--line);
          border-radius: 30px;
          padding: 18px;
          background: var(--panel);
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.09);
        }

        .weekHeader,
        .calendarGrid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }

        .weekHeader div {
          padding: 10px 8px 14px;
          color: var(--subtext);
          text-align: center;
          font-size: 13px;
          font-weight: 900;
        }

        .calendarGrid {
          gap: 8px;
        }

        .dateCell {
          min-height: 128px;
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 12px;
          background: #ffffff;
          text-align: left;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            border-color 0.15s ease;
        }

        .dateCell:hover {
          transform: translateY(-2px);
          border-color: #c7d2fe;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
        }

        .dateCell.otherMonth {
          opacity: 0.42;
          background: #fafafa;
        }

        .dateCell.today {
          outline: 2px solid var(--black);
        }

        .dateCell.locked {
          background: linear-gradient(145deg, var(--orange-soft), #ffffff);
        }

        .dateCell.reserved {
          background: linear-gradient(145deg, var(--green-soft), #ffffff);
        }

        .dateTop {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
          margin-bottom: 10px;
        }

        .dateTop span {
          font-size: 17px;
          font-weight: 950;
        }

        .dateTop em {
          border-radius: 999px;
          padding: 4px 7px;
          background: rgba(255, 255, 255, 0.78);
          color: var(--orange);
          font-style: normal;
          font-size: 11px;
          font-weight: 900;
        }

        .reservationBadges {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .reservationBadge {
          display: block;
          overflow: hidden;
          width: 100%;
          border-radius: 999px;
          padding: 6px 8px;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 900;
        }

        .reservationBadge.grandeur {
          color: #166534;
          background: var(--green-soft);
        }

        .reservationBadge.ray {
          color: #1d4ed8;
          background: var(--blue-soft);
        }

        .legend {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 14px;
          color: var(--subtext);
          font-size: 13px;
          font-weight: 800;
        }

        .legend span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .legend i {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 1px solid var(--line);
          border-radius: 5px;
        }

        .legendReserved {
          background: var(--green-soft);
        }

        .legendLocked {
          background: var(--orange-soft);
        }

        .legendToday {
          background: #ffffff;
          border: 2px solid var(--black) !important;
        }

        .listPanel {
          margin-top: 24px;
          border: 1px solid var(--line);
          border-radius: 30px;
          padding: 22px;
          background: rgba(255, 255, 255, 0.86);
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
        }

        .sectionTitle {
          margin-bottom: 14px;
        }

        .reservationList {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .reservationItem {
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 15px;
          background: #ffffff;
        }

        .reservationItem strong {
          display: block;
          margin-bottom: 7px;
          font-size: 16px;
        }

        .reservationItem p {
          margin: 0 0 7px;
          color: var(--text);
          font-weight: 800;
        }

        .reservationItem span {
          color: var(--subtext);
          font-size: 14px;
        }

        .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 70;
          border-radius: 18px;
          padding: 15px 18px;
          color: #ffffff;
          background: var(--black);
          box-shadow: 0 18px 44px rgba(15, 23, 42, 0.26);
          font-weight: 900;
        }

        .modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.52);
          backdrop-filter: blur(8px);
        }

        .modal {
          width: min(760px, 100%);
          max-height: calc(100vh - 40px);
          overflow: auto;
          border-radius: 30px;
          padding: 24px;
          background: #ffffff;
          box-shadow: 0 34px 90px rgba(15, 23, 42, 0.28);
        }

        .modalHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .closeButton {
          width: 42px;
          height: 42px;
          border: 0;
          border-radius: 14px;
          background: var(--gray-soft);
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          font-weight: 950;
        }

        input,
        select {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 15px;
          padding: 12px 13px;
          outline: none;
          background: #ffffff;
          color: var(--text);
          font-size: 15px;
        }

        input:focus,
        select:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 4px #eef2ff;
        }

        .terms {
          display: grid;
          grid-template-columns: 22px 1fr;
          align-items: flex-start;
          gap: 10px;
          margin: 18px 0;
          border-radius: 20px;
          padding: 16px;
          background: #f9fafb;
          color: #374151;
          line-height: 1.65;
        }

        .terms input {
          width: 18px;
          margin-top: 4px;
        }

        .modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .cancelButton,
        .confirmButton {
          border: 0;
          border-radius: 15px;
          padding: 13px 20px;
          font-size: 15px;
          font-weight: 950;
          cursor: pointer;
        }

        .cancelButton {
          color: var(--black);
          background: var(--gray-soft);
        }

        .confirmButton {
          color: #ffffff;
          background: var(--black);
        }

        @media (max-width: 920px) {
          .hero,
          .toolbar,
          .ruleBox {
            align-items: stretch;
            flex-direction: column;
          }

          .statsGrid,
          .reservationList {
            grid-template-columns: 1fr;
          }

          .calendarPanel {
            overflow-x: auto;
          }

          .weekHeader,
          .calendarGrid {
            grid-template-columns: repeat(7, minmax(92px, 1fr));
          }

          .formGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
