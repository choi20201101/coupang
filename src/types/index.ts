// 상품 정보 타입
export interface Product {
  id: string;
  url: string;
  name: string;
  expectedSeller: string; // 우리 판매자 이름
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 모니터링 결과 타입
export interface MonitoringResult {
  id: string;
  productId: string;
  productUrl: string;
  productName: string;
  expectedSeller: string;
  actualSeller: string;
  sellerLink: string | null;
  isFraudulent: boolean;
  checkedAt: string;
}

// 알림 로그 타입
export interface AlertLog {
  id: string;
  productId: string;
  productName: string;
  expectedSeller: string;
  actualSeller: string;
  alertedAt: string;
  slackResponse: string | null;
}

// 설정 타입
export interface AppConfig {
  slackWebhookUrl: string;
  slackChannel: string;
  checkIntervalMinutes: { min: number; max: number }; // 5~10분
  checkIntervalVarianceSeconds: number; // ±30초
  headless: boolean;
}

// 크롤링 결과 타입
export interface CrawlResult {
  success: boolean;
  sellerName: string | null;
  sellerLink: string | null;
  productName: string | null;
  error?: string;
}

// API 응답 타입
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 슬랙 메시지 타입
export interface SlackMessage {
  channel?: string;
  username?: string;
  icon_emoji?: string;
  attachments?: SlackAttachment[];
  text?: string;
}

export interface SlackAttachment {
  color: string;
  title: string;
  title_link?: string;
  fields: SlackField[];
  footer?: string;
  ts?: number;
}

export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

// 모니터링 상태 타입
export interface MonitoringStatus {
  isRunning: boolean;
  lastCheckTime: string | null;
  nextCheckTime: string | null;
  totalChecks: number;
  fraudulentFound: number;
}
