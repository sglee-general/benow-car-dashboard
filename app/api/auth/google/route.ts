import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, createOauthState, oauthStateCookieName } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const state = createOauthState();
    const response = NextResponse.redirect(buildGoogleAuthUrl(request.url, state));
    response.cookies.set(oauthStateCookieName, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google 로그인 설정을 확인해 주세요.";
    return new NextResponse(message, { status: 500 });
  }
}
