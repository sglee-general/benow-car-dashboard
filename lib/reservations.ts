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
  createdAt: string;
};

type RedisResult<T> = { result?: T; error?: string };

const namespace = "binow-company-car";
const listKey = `${namespace}:reservation-ids`;

const memory = globalThis as typeof globalThis & {
  __companyCarReservations?: Map<string, Reservation>;
  __companyCarSlots?: Map<string, string>;
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

function slotKey(carId: CarId, date: string) {
  return `${namespace}:slot:${carId}:${date}`;
}

function reservationKey(id: string) {
  return `${namespace}:reservation:${id}`;
}

function getMemoryReservations() {
  memory.__companyCarReservations ??= new Map();
  memory.__companyCarSlots ??= new Map();
  return {
    reservations: memory.__companyCarReservations,
    slots: memory.__companyCarSlots
  };
}

function compareReservations(a: Reservation, b: Reservation) {
  return `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`);
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

  return [...getMemoryReservations().reservations.values()].sort(compareReservations);
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
    for (const date of dates) {
      if (store.slots.has(slotKey(input.carId, date))) {
        throw new Error(`${date}은 이미 예약이 완료된 날짜입니다.`);
      }
    }
    for (const date of dates) store.slots.set(slotKey(input.carId, date), id);
    store.reservations.set(id, reservation);
    return reservation;
  }

  const lockedSlots: string[] = [];
  try {
    for (const date of dates) {
      const key = slotKey(input.carId, date);
      const result = await redisCommand<"OK" | null>(["SET", key, id, "NX"]);
      if (result !== "OK") throw new Error(`${date}은 이미 예약이 완료된 날짜입니다.`);
      lockedSlots.push(key);
    }
    await redisCommand(["SET", reservationKey(id), JSON.stringify(reservation)]);
    await redisCommand(["SADD", listKey, id]);
    return reservation;
  } catch (error) {
    await Promise.all(lockedSlots.map((key) => redisCommand(["DEL", key]).catch(() => undefined)));
    throw error;
  }
}
