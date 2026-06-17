import { NextResponse } from "next/server";
import { getGoogleUserFromCode, oauthStateCookieName, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${oauthStateCookieName}=`))
    ?.split("=")[1];

  if (!code || !state || !expectedState || state !== decodeURIComponent(expectedState)) {
    return NextResponse.redirect(new URL("/?authError=invalid_state", url.origin));
  }

  try {
    const user = await getGoogleUserFromCode(request.url, code);
    const response = NextResponse.redirect(new URL("/", url.origin));
    setSessionCookie(response, user);
    response.cookies.set(oauthStateCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    });
    return response;
  } catch (error) {
    console.error("Google login failed", error);
    return NextResponse.redirect(new URL("/?authError=google_login_failed", url.origin));
  }
}
