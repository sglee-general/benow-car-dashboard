import type { Reservation } from "./reservations";

async function slackApi<T>(method: string, body: Record<string, unknown>) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const data = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || `Slack API ${method} failed`);
  return data;
}

export async function sendReservationCompleteMessage(reservation: Reservation) {
  if (!reservation.slackUserId || !process.env.SLACK_BOT_TOKEN) return;

  const opened = await slackApi<{ channel: { id: string } }>("conversations.open", {
    users: reservation.slackUserId
  });
  if (!opened?.channel?.id) return;

  const period = `${reservation.startDate} ${reservation.startTime} ~ ${reservation.endDate} ${reservation.endTime}`;

  await slackApi("chat.postMessage", {
    channel: opened.channel.id,
    text: `공용 법인차량 예약이 완료되었습니다. ${reservation.carName} / ${period}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*비나우 공용 법인차량 예약이 완료되었습니다.*"
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*차량*\n${reservation.carName}` },
          { type: "mrkdwn", text: `*예약자*\n${reservation.bookerName} / ${reservation.department}` },
          { type: "mrkdwn", text: `*직책*\n${reservation.title}` },
          { type: "mrkdwn", text: `*예약 기간*\n${period}` }
        ]
      }
    ]
  });
}
