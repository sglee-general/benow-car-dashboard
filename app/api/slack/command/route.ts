import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function verifySlackRequest(rawBody: string, request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return process.env.NODE_ENV !== "production";

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${crypto.createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  const expected = Buffer.from(digest);
  const actual = Buffer.from(slackSignature);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackRequest(rawBody, request)) {
    return new NextResponse("Invalid Slack signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  if (params.get("ssl_check") === "1") return new NextResponse("OK");

  const slackUserId = params.get("user_id") || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const dashboardUrl = `${appUrl}/?slackUserId=${encodeURIComponent(slackUserId)}`;

  return NextResponse.json({
    response_type: "ephemeral",
    text: "비나우 공용 법인차량 예약 현황입니다.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*비나우 공용 법인차량 예약*\n예약 현황을 확인하고 가능한 날짜를 선택해 주세요."
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "예약 캘린더 열기" },
            style: "primary",
            url: dashboardUrl,
            action_id: "open_company_car_calendar"
          }
        ]
      }
    ]
  });
}
