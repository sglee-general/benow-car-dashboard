import { datesBetween } from "./dates";

export const cars = [
  { id: "grandeur", name: "그랜져" },
  { id: "ray", name: "레이" }
] as const;

export type CarId = (typeof cars)[number]["id"];

export type Reservation = {
  id: string;
  carId: CarId;
  carName: string;
  bookerName: string;
  title: string;
  department: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  slackUserId?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt: string;
};

type RedisResult<T> = { result?: T; error?: string };

const namespace = "binow-company-car";
const listKey = `${namespace}:reservation-ids`;

const memory = globalThis as typeof globalThis & {
  __companyCarReservations?: Map<string, Reservation>;
};

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function redisCommand<T>(command: unknown[]) {
  const config = redisConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  });

  const data = (await response.json()) as RedisResult<T>;
  if (!response.ok || data.error) throw new Error(data.error || "Redis request failed");
  return data.result;
}

function reservationKey(id: string) {
  return `${namespace}:reservation:${id}`;
}

function lockKey(carId: CarId, date: string) {
  return `${namespace}:lock:${carId}:${date}`;
}

function getMemoryReservations() {
  memory.__companyCarReservations ??= new Map();
  return memory.__companyCarReservations;
}

function compareReservations(a: Reservation, b: Reservation) {
  return `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`);
}

function reservationStart(reservation: Pick<Reservation, "startDate" | "startTime">) {
  return `${reservation.startDate}T${reservation.startTime}`;
}

function reservationEnd(reservation: Pick<Reservation, "endDate" | "endTime">) {
  return `${reservation.endDate}T${reservation.endTime}`;
}

function findOverlappingReservation(
  reservations: Reservation[],
  input: Pick<Reservation, "carId" | "startDate" | "startTime" | "endDate" | "endTime">
) {
  const inputStart = `${input.startDate}T${input.startTime}`;
  const inputEnd = `${input.endDate}T${input.endTime}`;

  return reservations.find((reservation) => {
    if (reservation.carId !== input.carId) return false;
    return inputStart < reservationEnd(reservation) && inputEnd > reservationStart(reservation);
  });
}

function assertNoOverlap(
  reservations: Reservation[],
  input: Pick<Reservation, "carId" | "startDate" | "startTime" | "endDate" | "endTime">
) {
  const overlap = findOverlappingReservation(reservations, input);
  if (!overlap) return;

  throw new Error(
    `${overlap.carName}은 ${overlap.startDate} ${overlap.startTime} ~ ${overlap.endDate} ${overlap.endTime}에 이미 예약되어 있습니다.`
  );
}

export function getCarName(carId: CarId) {
  return cars.find((item) => item.id === carId)?.name;
}

export function isCarId(value: unknown): value is CarId {
  return cars.some((item) => item.id === value);
}

export async function getReservations() {
  const ids = await redisCommand<string[]>(["SMEMBERS", listKey]);
  if (ids) {
    if (ids.length === 0) return [];
    const values = await redisCommand<(string | null)[]>(["MGET", ...ids.map(reservationKey)]);
    return (values || [])
      .filter((value): value is string => Boolean(value))
      .map((value) => JSON.parse(value) as Reservation)
      .sort(compareReservations);
  }

  return [...getMemoryReservations().values()].sort(compareReservations);
}

export async function getReservationById(id: string) {
  const value = await redisCommand<string | null>(["GET", reservationKey(id)]);
  if (value) return JSON.parse(value) as Reservation;
  if (value === null) return null;
  return getMemoryReservations().get(id) || null;
}

export async function deleteReservation(id: string) {
  const config = redisConfig();
  if (!config) return getMemoryReservations().delete(id);

  await redisCommand(["DEL", reservationKey(id)]);
  await redisCommand(["SREM", listKey, id]);
  return true;
}

export async function createReservation(input: Omit<Reservation, "id" | "createdAt" | "carName">) {
  const carName = getCarName(input.carId);
  if (!carName) throw new Error("차량을 선택해 주세요.");

  const dates = datesBetween(input.startDate, input.endDate);
  if (dates.length === 0) throw new Error("예약일자와 반납일자를 확인해 주세요.");

  const id = crypto.randomUUID();
  const reservation: Reservation = {
    ...input,
    id,
    carName,
    createdAt: new Date().toISOString()
  };

  const config = redisConfig();
  if (!config) {
    const store = getMemoryReservations();
    assertNoOverlap([...store.values()], input);
    store.set(id, reservation);
    return reservation;
  }

  const lockValue = crypto.randomUUID();
  const lockKeys: string[] = [];

  try {
    for (const date of dates) {
      const key = lockKey(input.carId, date);
      const result = await redisCommand<"OK" | null>(["SET", key, lockValue, "NX", "EX", 10]);
      if (result !== "OK") throw new Error("다른 예약이 처리 중입니다. 잠시 후 다시 시도해 주세요.");
      lockKeys.push(key);
    }

    assertNoOverlap(await getReservations(), input);
    await redisCommand(["SET", reservationKey(id), JSON.stringify(reservation)]);
    await redisCommand(["SADD", listKey, id]);
    return reservation;
  } finally {
    await Promise.all(lockKeys.map((key) => redisCommand(["DEL", key]).catch(() => undefined)));
  }
}
