import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { CrawlResult } from '../types';
import db from '../database';
import antiDetection, { getStealthLaunchOptions, getRandomUserAgent, applyAllAntiDetection } from './anti-detection';
import coupangBypass, {
  bypassCoupangDetection,
  setCoupangCookies,
  warmupCoupangSession,
  humanMouseMovement,
  humanScroll,
  detectBotBlock,
  retryOnBlock
} from './coupang-bypass';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Stealth 플러그인 적용 (봇 탐지 우회)
puppeteer.use(StealthPlugin());

class CoupangCrawler {
  private browser: Browser | null = null;
  private isInitialized: boolean = false;
  private userDataDir: string | null = null;
  private currentUserAgent: string = '';
  private sessionWarmedUp: boolean = false;

  /**
   * 사용자 데이터 디렉토리 생성/확인
   */
  private getUserDataDir(): string {
    if (this.userDataDir) return this.userDataDir;

    // 홈 디렉토리에 크롬 프로필 디렉토리 생성
    const homeDir = os.homedir();
    const profileDir = path.join(homeDir, '.coupang-monitor', 'chrome-profile');

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
      console.log(`[Crawler] Chrome 프로필 디렉토리 생성: ${profileDir}`);
    }

    this.userDataDir = profileDir;
    return profileDir;
  }

  /**
   * 브라우저 초기화 (고급 안티-탐지 적용)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const config = db.getConfig();
    this.currentUserAgent = getRandomUserAgent();

    // 사용자 프로필 디렉토리
    const userDataDir = this.getUserDataDir();

    console.log('[Crawler] 고급 안티-탐지 모드로 브라우저 초기화 중...');

    // 스텔스 런치 옵션 가져오기
    const launchOptions = getStealthLaunchOptions(config.headless, userDataDir) as any;

    // User-Agent 추가
    launchOptions.args.push(`--user-agent=${this.currentUserAgent}`);

    this.browser = await puppeteer.launch(launchOptions);

    this.isInitialized = true;
    this.sessionWarmedUp = false;
    console.log('[Crawler] 브라우저 초기화 완료 (고급 안티-탐지 모드)');
    console.log(`[Crawler] User-Agent: ${this.currentUserAgent}`);
    console.log(`[Crawler] 프로필 경로: ${userDataDir}`);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      this.sessionWarmedUp = false;
      console.log('[Crawler] 브라우저 종료');
    }
  }

  // 사람처럼 무작위 딜레이 추가
  private async randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // 사람처럼 스크롤 (개선된 버전)
  private async humanLikeScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );

      let currentPosition = 0;

      // 더 자연스러운 스크롤 (속도 변화)
      while (currentPosition < scrollHeight / 3) {
        // 스텝 크기 변화 (가속/감속)
        const step = Math.floor(Math.random() * 150) + 50;
        currentPosition += step;
        window.scrollTo({
          top: currentPosition,
          behavior: 'auto'
        });
        // 불규칙한 타이밍
        await delay(Math.floor(Math.random() * 80) + 30);
      }

      // 가끔 위로 조금 스크롤 (실제 사용자 행동)
      if (Math.random() < 0.3) {
        await delay(300);
        window.scrollBy(0, -(Math.random() * 100 + 50));
      }
    });
  }

  // 사람처럼 마우스 이동 (개선된 버전 - 베지어 곡선)
  private async humanLikeMouseMove(page: Page): Promise<void> {
    const viewportSize = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    // 더 자연스러운 마우스 이동 (베지어 곡선 사용)
    const movements = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < movements; i++) {
      const targetX = Math.floor(Math.random() * (viewportSize.width - 100)) + 50;
      const targetY = Math.floor(Math.random() * (viewportSize.height - 100)) + 50;

      await humanMouseMovement(page, targetX, targetY);
      await this.randomDelay(200, 500);
    }
  }

  /**
   * 페이지에 안티-탐지 기술 적용
   */
  private async applyPageProtection(page: Page): Promise<void> {
    // 고급 안티-탐지 기술 적용
    await applyAllAntiDetection(page, {
      userAgent: this.currentUserAgent
    });

    // 쿠팡 특화 우회
    await bypassCoupangDetection(page);
  }

  /**
   * 세션 워밍업 (첫 방문 시)
   */
  private async ensureSessionWarmedUp(page: Page): Promise<void> {
    if (this.sessionWarmedUp) return;

    console.log('[Crawler] 첫 접속 - 세션 워밍업 중...');

    // 쿠키 설정
    await setCoupangCookies(page);

    // 쿠팡 메인 페이지 방문
    await warmupCoupangSession(page);

    this.sessionWarmedUp = true;
    console.log('[Crawler] 세션 워밍업 완료');
  }

  // 쿠팡 상품 페이지에서 판매자 정보 크롤링 (개선된 버전)
  async crawlSellerInfo(url: string): Promise<CrawlResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();

    try {
      // 페이지 보호 기술 적용
      await this.applyPageProtection(page);

      // 세션 워밍업
      await this.ensureSessionWarmedUp(page);

      // 쿠키 및 추가 헤더 설정
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.coupang.com/'
      });

      // 페이지 로드 전 랜덤 딜레이
      await this.randomDelay(800, 2000);

      console.log(`[Crawler] 페이지 로드 시작: ${url}`);

      // 페이지 이동
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 45000
      });

      // 봇 차단 감지
      let isBlocked = await detectBotBlock(page);

      if (isBlocked) {
        console.log('[Crawler] 봇 차단 감지됨, 재시도 중...');
        const success = await retryOnBlock(page, url, 3);
        if (!success) {
          return {
            success: false,
            sellerName: null,
            sellerLink: null,
            productName: null,
            error: '봇 차단으로 인해 페이지 접근 실패'
          };
        }
      }

      // 페이지 로드 후 사람처럼 행동
      await this.randomDelay(1500, 3000);
      await this.humanLikeMouseMove(page);
      await this.humanLikeScroll(page);
      await this.randomDelay(800, 1500);

      // 판매자 정보 추출
      const sellerInfo = await page.evaluate(() => {
        // 방법 1: seller-info 클래스를 가진 div 찾기
        const sellerInfoDiv = document.querySelector('.seller-info');
        if (sellerInfoDiv) {
          const sellerLink = sellerInfoDiv.querySelector('a');
          if (sellerLink) {
            return {
              sellerName: sellerLink.textContent?.trim() || null,
              sellerLink: sellerLink.href || null
            };
          }
        }

        // 방법 2: "판매자:" 텍스트가 포함된 요소 찾기
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          if (div.textContent?.includes('판매자:') && div.querySelector('a')) {
            const link = div.querySelector('a');
            if (link && link.href?.includes('shop.coupang.com')) {
              return {
                sellerName: link.textContent?.trim() || null,
                sellerLink: link.href || null
              };
            }
          }
        }

        // 방법 3: twc-flex 클래스 기반 셀렉터
        const flexDivs = document.querySelectorAll('div.twc-flex.twc-flex-row.twc-justify-start.twc-items-center.twc-flex-wrap');
        for (const div of flexDivs) {
          if (div.textContent?.includes('판매자')) {
            const link = div.querySelector('a[href*="shop.coupang.com"]');
            if (link) {
              return {
                sellerName: (link as HTMLAnchorElement).textContent?.trim() || null,
                sellerLink: (link as HTMLAnchorElement).href || null
              };
            }
          }
        }

        // 방법 4: 판매자 링크 직접 찾기
        const sellerLinks = document.querySelectorAll('a[href*="shop.coupang.com/vid/"]');
        for (const link of sellerLinks) {
          const text = link.textContent?.trim();
          if (text && text.length > 0) {
            return {
              sellerName: text,
              sellerLink: (link as HTMLAnchorElement).href
            };
          }
        }

        // 방법 5: 판매자 상품 보러가기 버튼 근처에서 찾기
        const sellerButtons = document.querySelectorAll('a[href*="판매자 상품 보러가기"], button:contains("판매자 상품 보러가기")');
        if (sellerButtons.length > 0) {
          const parent = sellerButtons[0].closest('div');
          if (parent) {
            const links = parent.querySelectorAll('a');
            for (const link of links) {
              if ((link as HTMLAnchorElement).href?.includes('shop.coupang.com')) {
                return {
                  sellerName: link.textContent?.trim() || null,
                  sellerLink: (link as HTMLAnchorElement).href || null
                };
              }
            }
          }
        }

        // 방법 6: 데이터 속성으로 찾기
        const dataSellerElements = document.querySelectorAll('[data-vendor-item-id], [data-vendor-id]');
        for (const el of dataSellerElements) {
          const nearbyLink = el.querySelector('a[href*="shop.coupang.com"]') ||
                            el.parentElement?.querySelector('a[href*="shop.coupang.com"]');
          if (nearbyLink) {
            return {
              sellerName: nearbyLink.textContent?.trim() || null,
              sellerLink: (nearbyLink as HTMLAnchorElement).href || null
            };
          }
        }

        return { sellerName: null, sellerLink: null };
      });

      // 상품명 추출
      const productName = await page.evaluate(() => {
        // h1 태그에서 상품명 찾기
        const h1 = document.querySelector('h1.prod-buy-header__title');
        if (h1) return h1.textContent?.trim() || null;

        // meta 태그에서 찾기
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) return metaTitle.getAttribute('content') || null;

        // 다른 h1 태그
        const anyH1 = document.querySelector('h1');
        if (anyH1) return anyH1.textContent?.trim() || null;

        // title 태그
        return document.title.replace(' - 쿠팡!', '').trim() || null;
      });

      console.log(`[Crawler] 크롤링 완료 - 판매자: ${sellerInfo.sellerName}, 상품: ${productName}`);

      return {
        success: true,
        sellerName: sellerInfo.sellerName,
        sellerLink: sellerInfo.sellerLink,
        productName
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Crawler] 크롤링 실패: ${errorMessage}`);

      // 타임아웃이나 네비게이션 에러 시 브라우저 재시작 고려
      if (errorMessage.includes('timeout') || errorMessage.includes('Navigation')) {
        console.log('[Crawler] 타임아웃 발생 - 다음 요청 시 브라우저 재초기화 예정');
        this.sessionWarmedUp = false;
      }

      return {
        success: false,
        sellerName: null,
        sellerLink: null,
        productName: null,
        error: errorMessage
      };
    } finally {
      await page.close();
    }
  }

  // 여러 상품 순차 크롤링
  async crawlMultipleProducts(urls: string[]): Promise<Map<string, CrawlResult>> {
    const results = new Map<string, CrawlResult>();

    for (const url of urls) {
      const result = await this.crawlSellerInfo(url);
      results.set(url, result);

      // 상품 간 더 긴 랜덤 딜레이 (봇 탐지 방지)
      if (urls.indexOf(url) < urls.length - 1) {
        const delay = 5000 + Math.random() * 10000; // 5~15초
        console.log(`[Crawler] 다음 상품까지 ${Math.round(delay / 1000)}초 대기...`);
        await this.randomDelay(5000, 15000);
      }
    }

    return results;
  }

  // 브라우저 상태 확인
  isReady(): boolean {
    return this.isInitialized && this.browser !== null;
  }

  /**
   * 브라우저 재시작 (문제 발생 시)
   */
  async restart(): Promise<void> {
    console.log('[Crawler] 브라우저 재시작 중...');
    await this.close();

    // User-Agent 변경
    this.currentUserAgent = getRandomUserAgent();

    await this.initialize();
    console.log('[Crawler] 브라우저 재시작 완료');
  }

  /**
   * 프로필 초기화 (캐시/쿠키 삭제)
   */
  async clearProfile(): Promise<void> {
    const profileDir = this.getUserDataDir();

    await this.close();

    // 프로필 디렉토리 삭제
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
      console.log('[Crawler] 프로필 초기화 완료');
    }

    this.userDataDir = null;
    await this.initialize();
  }
}

export const crawler = new CoupangCrawler();
export default crawler;
