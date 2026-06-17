import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json({ user: readSessionFromRequest(request) });
}
