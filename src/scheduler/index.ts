import { MonitoringStatus, MonitoringResult, Product } from '../types';
import db from '../database';
import crawler from '../crawler';
import slackService from '../services/slack';

class MonitoringScheduler {
  private isRunning: boolean = false;
  private lastCheckTime: Date | null = null;
  private nextCheckTime: Date | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private totalChecks: number = 0;
  private fraudulentFound: number = 0;

  // 랜덤 간격 계산 (분 단위 + 초 단위 오차)
  private calculateNextInterval(): number {
    const config = db.getConfig();
    const { min, max } = config.checkIntervalMinutes;
    const variance = config.checkIntervalVarianceSeconds;

    // 5~10분 사이 랜덤
    const baseMinutes = Math.floor(Math.random() * (max - min + 1)) + min;

    // ±30초 오차
    const varianceSeconds = Math.floor(Math.random() * (variance * 2 + 1)) - variance;

    // 총 밀리초 반환
    return (baseMinutes * 60 + varianceSeconds) * 1000;
  }

  // 판매자 이름 비교 (부분 일치 허용)
  private isSameSeller(expected: string, actual: string | null): boolean {
    if (!actual) return false;

    // 정규화: 공백 제거, 소문자 변환
    const normalizedExpected = expected.replace(/\s+/g, '').toLowerCase();
    const normalizedActual = actual.replace(/\s+/g, '').toLowerCase();

    // 정확히 일치
    if (normalizedExpected === normalizedActual) return true;

    // 부분 일치 (expected가 actual에 포함되거나 그 반대)
    if (normalizedExpected.includes(normalizedActual) || normalizedActual.includes(normalizedExpected)) {
      return true;
    }

    // (주), (주)식회사 등의 접두사 제거 후 비교
    const cleanExpected = normalizedExpected.replace(/\(주\)|주식회사|㈜/g, '');
    const cleanActual = normalizedActual.replace(/\(주\)|주식회사|㈜/g, '');

    return cleanExpected === cleanActual ||
           cleanExpected.includes(cleanActual) ||
           cleanActual.includes(cleanExpected);
  }

  // 단일 상품 모니터링
  private async monitorProduct(product: Product): Promise<MonitoringResult> {
    console.log(`[Scheduler] 상품 모니터링 시작: ${product.name}`);

    const crawlResult = await crawler.crawlSellerInfo(product.url);
    const now = new Date().toISOString();

    const isFraudulent = !this.isSameSeller(product.expectedSeller, crawlResult.sellerName);

    const result: MonitoringResult = {
      id: '', // DB에서 생성
      productId: product.id,
      productUrl: product.url,
      productName: crawlResult.productName || product.name,
      expectedSeller: product.expectedSeller,
      actualSeller: crawlResult.sellerName || '알 수 없음',
      sellerLink: crawlResult.sellerLink,
      isFraudulent,
      checkedAt: now
    };

    // DB에 결과 저장
    const savedResult = db.addMonitoringResult(result);

    // 사기 판매자 감지 시 알림
    if (isFraudulent) {
      console.log(`[Scheduler] ⚠️ 사기 판매자 감지! 상품: ${product.name}, 판매자: ${crawlResult.sellerName}`);

      const alertResponse = await slackService.sendFraudAlert(savedResult);

      // 알림 로그 저장
      db.addAlertLog({
        productId: product.id,
        productName: savedResult.productName || product.name,
        expectedSeller: product.expectedSeller,
        actualSeller: savedResult.actualSeller,
        alertedAt: now,
        slackResponse: alertResponse.response || alertResponse.error || null
      });

      this.fraudulentFound++;
    } else {
      console.log(`[Scheduler] ✅ 정상 - 상품: ${product.name}, 판매자: ${crawlResult.sellerName}`);
    }

    return savedResult;
  }

  // 모든 활성 상품 모니터링
  private async runMonitoringCycle(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[Scheduler] 모니터링 사이클 시작');
    this.lastCheckTime = new Date();

    const activeProducts = db.getActiveProducts();

    if (activeProducts.length === 0) {
      console.log('[Scheduler] 활성 상품이 없습니다.');
    } else {
      for (const product of activeProducts) {
        if (!this.isRunning) break;

        try {
          await this.monitorProduct(product);
          this.totalChecks++;

          // 상품 간 랜덤 딜레이 (2~5초)
          if (activeProducts.indexOf(product) < activeProducts.length - 1) {
            const delay = Math.floor(Math.random() * 3000) + 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(`[Scheduler] 상품 모니터링 실패: ${product.name}`, error);
        }
      }
    }

    // 다음 사이클 스케줄링
    if (this.isRunning) {
      this.scheduleNextCycle();
    }
  }

  // 다음 사이클 스케줄링
  private scheduleNextCycle(): void {
    const interval = this.calculateNextInterval();
    this.nextCheckTime = new Date(Date.now() + interval);

    console.log(`[Scheduler] 다음 검사: ${this.nextCheckTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (${Math.round(interval / 1000)}초 후)`);

    this.timeoutId = setTimeout(() => {
      this.runMonitoringCycle();
    }, interval);
  }

  // 모니터링 시작
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] 이미 실행 중입니다.');
      return;
    }

    console.log('[Scheduler] 모니터링 시작');
    this.isRunning = true;

    // 브라우저 초기화
    await crawler.initialize();

    // 슬랙 알림
    await slackService.sendMonitoringStarted();

    // 즉시 첫 번째 사이클 실행
    await this.runMonitoringCycle();
  }

  // 모니터링 중지
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[Scheduler] 실행 중이 아닙니다.');
      return;
    }

    console.log('[Scheduler] 모니터링 중지');
    this.isRunning = false;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.nextCheckTime = null;

    // 브라우저 종료
    await crawler.close();

    // 슬랙 알림
    await slackService.sendMonitoringStopped();
  }

  // 상태 조회
  getStatus(): MonitoringStatus {
    return {
      isRunning: this.isRunning,
      lastCheckTime: this.lastCheckTime?.toISOString() || null,
      nextCheckTime: this.nextCheckTime?.toISOString() || null,
      totalChecks: this.totalChecks,
      fraudulentFound: this.fraudulentFound
    };
  }

  // 수동으로 즉시 실행
  async runNow(): Promise<void> {
    if (!this.isRunning) {
      console.log('[Scheduler] 모니터링이 실행 중이 아닙니다. 먼저 start()를 호출하세요.');
      return;
    }

    // 기존 스케줄 취소
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 즉시 실행
    await this.runMonitoringCycle();
  }

  // 단일 상품 즉시 테스트
  async testProduct(productId: string): Promise<MonitoringResult | null> {
    const product = db.getProductById(productId);
    if (!product) {
      console.log('[Scheduler] 상품을 찾을 수 없습니다.');
      return null;
    }

    // 임시로 브라우저 초기화 (이미 실행 중이면 재사용)
    const wasRunning = crawler.isReady();
    if (!wasRunning) {
      await crawler.initialize();
    }

    try {
      return await this.monitorProduct(product);
    } finally {
      if (!wasRunning && !this.isRunning) {
        await crawler.close();
      }
    }
  }
}

export const scheduler = new MonitoringScheduler();
export default scheduler;
