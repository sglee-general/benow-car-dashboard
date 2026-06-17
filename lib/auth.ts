import crypto from "node:crypto";

export type UserSession = {
  email: string;
  name: string;
  picture?: string;
  hd?: string;
};

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  hd?: string;
};

const sessionCookieName = "company_car_session";
export const oauthStateCookieName = "company_car_oauth_state";

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.SLACK_SIGNING_SECRET || "";
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function getAppUrl(requestUrl: string) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin;
}

function getRedirectUri(requestUrl: string) {
  return `${getAppUrl(requestUrl)}/api/auth/google/callback`;
}

function sign(value: string) {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET 환경변수가 필요합니다.");
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(cookieHeader: string | null) {
  return new Map(
    (cookieHeader || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] as const;
      })
  );
}

export function createOauthState() {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildGoogleAuthUrl(requestUrl: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", getRequiredEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getRedirectUri(requestUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const workspaceDomain = process.env.GOOGLE_WORKSPACE_DOMAIN;
  if (workspaceDomain) url.searchParams.set("hd", workspaceDomain);

  return url;
}

export async function getGoogleUserFromCode(requestUrl: string, code: string) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: getRedirectUri(requestUrl),
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  });

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Google 토큰 발급에 실패했습니다.");
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    cache: "no-store"
  });
  const user = (await userResponse.json()) as GoogleUserInfo;
  if (!userResponse.ok || !user.email || user.email_verified === false) {
    throw new Error("Google 계정 정보를 확인하지 못했습니다.");
  }

  const workspaceDomain = process.env.GOOGLE_WORKSPACE_DOMAIN;
  if (workspaceDomain && user.email.split("@")[1] !== workspaceDomain) {
    throw new Error(`${workspaceDomain} 계정으로만 로그인할 수 있습니다.`);
  }

  return {
    email: user.email,
    name: user.name || user.email,
    picture: user.picture,
    hd: user.hd
  } satisfies UserSession;
}

export function createSessionToken(user: UserSession) {
  const payload = base64Url(
    JSON.stringify({
      user,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14
    })
  );
  return `${payload}.${sign(payload)}`;
}

export function readSessionFromRequest(request: Request): UserSession | null {
  const token = parseCookies(request.headers.get("cookie")).get(sessionCookieName);
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature !== sign(payload)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user?: UserSession; exp?: number };
    if (!data.user?.email || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.user;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: Response & { cookies: { set: Function } }, user: UserSession) {
  response.cookies.set(sessionCookieName, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

export function clearSessionCookie(response: Response & { cookies: { set: Function } }) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
