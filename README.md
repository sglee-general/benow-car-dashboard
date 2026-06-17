# 비나우 공용 법인차량 예약

Slack `/법인차량` 명령어에서 열 수 있는 공용 법인차량 예약 캘린더입니다.

## 주요 기능

- `전체`, `그랜져`, `레이` 캘린더 필터
- 날짜 클릭 시 이름, 직책, 소속, 예약/반납 일시, 안전 운행 동의 입력
- 차량별 중복 예약 방지
- 예약 완료일 캘린더 표시 및 재예약 차단
- 평일 예약 상시 허용
- 주말/공휴일은 해당 월 전월 마지막 월요일 오전 10시 이후부터 예약 허용
- 예약 완료 시 Slack 개인 DM 발송
- Vercel KV 또는 Upstash Redis REST 저장소 사용
- 공공데이터포털 특일정보 API 연동

## Slack 설정

Slash Command 요청 URL:

```text
https://your-vercel-domain.vercel.app/api/slack/command
```

Slack 앱 권한:

```text
chat:write
im:write
commands
```

## Vercel 환경변수

`.env.example` 값을 기준으로 Vercel Project Settings에 등록합니다.

```text
NEXT_PUBLIC_APP_URL
SLACK_SIGNING_SECRET
SLACK_BOT_TOKEN
KV_REST_API_URL
KV_REST_API_TOKEN
KOREA_HOLIDAY_API_KEY
COMPANY_CAR_HOLIDAYS
```

`KV_REST_API_URL`, `KV_REST_API_TOKEN` 대신 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`도 사용할 수 있습니다. Redis 환경변수가 없으면 로컬 개발용 메모리 저장소로 동작합니다.

공공데이터 API 키가 아직 없거나 별도 회사 휴무일을 추가해야 하면 `COMPANY_CAR_HOLIDAYS`에 아래처럼 넣으면 캘린더와 예약 제한에 함께 반영됩니다.

```text
COMPANY_CAR_HOLIDAYS=2026-05-05:어린이날,2026-08-17:대체공휴일
```

## 실행

```bash
pnpm install
pnpm dev
```

빌드 검증:

```bash
pnpm build
```
