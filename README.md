# 쿠팡 판매자 모니터링 시스템

쿠팡 상품 페이지의 판매자 정보를 자동으로 모니터링하여, 등록된 판매자가 아닌 다른 리셀러나 가품 판매자가 등록되었을 때 슬랙으로 알림을 보내는 자동화 시스템입니다.

## 주요 기능

- **자동 크롤링**: Puppeteer Stealth 플러그인을 사용하여 쿠팡의 봇 차단을 우회
- **사람처럼 행동**: 랜덤 딜레이, 마우스 이동, 스크롤 등으로 봇 탐지 방지
- **실시간 모니터링**: 5~10분 간격 (±30초 오차)으로 자동 검사
- **슬랙 알림**: 이상 판매자 감지 시 즉시 슬랙 채널로 알림
- **어드민 웹 UI**: 상품 등록, 모니터링 제어, 결과 확인 기능

## 시스템 요구사항

- Node.js 18.x 이상
- Chrome/Chromium (Puppeteer가 자동 설치)

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm start
```

## 사용 방법

1. 서버 실행 후 브라우저에서 `http://localhost:3000` 접속
2. **설정**에서 슬랙 웹훅 URL 입력
3. **상품 추가**로 모니터링할 쿠팡 상품 등록
   - 상품 URL: 쿠팡 상품 페이지 URL
   - 상품명: 구분용 이름
   - 예상 판매자: 정상 판매자 이름 (예: "(주) 고지식바이오")
4. **모니터링 시작** 버튼 클릭

## API 엔드포인트

### 상품 관리
- `GET /api/products` - 상품 목록 조회
- `POST /api/products` - 상품 추가
- `PUT /api/products/:id` - 상품 수정
- `DELETE /api/products/:id` - 상품 삭제
- `PATCH /api/products/:id/toggle` - 상품 활성화/비활성화
- `POST /api/products/:id/test` - 단일 상품 테스트

### 모니터링 제어
- `GET /api/monitoring/status` - 모니터링 상태 조회
- `POST /api/monitoring/start` - 모니터링 시작
- `POST /api/monitoring/stop` - 모니터링 중지
- `POST /api/monitoring/run-now` - 즉시 검사

### 결과/로그
- `GET /api/results` - 검사 결과 조회
- `GET /api/results/fraudulent` - 이상 감지 결과만 조회
- `GET /api/alerts` - 알림 로그 조회

### 설정
- `GET /api/config` - 설정 조회
- `PUT /api/config` - 설정 업데이트
- `POST /api/slack/test` - 슬랙 테스트 메시지

## 프로젝트 구조

```
coupang/
├── src/
│   ├── index.ts          # 메인 진입점
│   ├── types/            # TypeScript 타입 정의
│   ├── database/         # SQLite DB 관리
│   ├── crawler/          # Puppeteer 크롤러
│   ├── services/         # 슬랙 알림 서비스
│   ├── scheduler/        # 모니터링 스케줄러
│   └── api/              # Express API
├── public/
│   └── index.html        # 어드민 웹 UI
├── data/                 # SQLite DB 파일 (자동 생성)
├── package.json
└── tsconfig.json
```

## 설정 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| slackWebhookUrl | - | 슬랙 Incoming Webhook URL |
| slackChannel | #coupang-alerts | 알림을 받을 슬랙 채널 |
| checkIntervalMinutes | { min: 5, max: 10 } | 검사 간격 (분) |
| checkIntervalVarianceSeconds | 30 | 간격 오차 (±초) |
| headless | true | 브라우저 헤드리스 모드 |

## 슬랙 웹훅 설정

1. Slack에서 앱 생성 또는 기존 앱에 Incoming Webhooks 추가
2. 웹훅 URL 복사 (형식: `https://hooks.slack.com/services/...`)
3. 어드민 UI의 설정에서 웹훅 URL 입력

## 주의사항

- 과도한 크롤링은 쿠팡 서비스 이용약관에 위배될 수 있습니다
- 본 시스템은 자사 상품 보호 목적으로만 사용하세요
- 크롤링 간격을 너무 짧게 설정하지 마세요

## 라이선스

ISC
