import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer-core';
import { CrawlResult } from '../types';
import db from '../database';
import { execSync } from 'child_process';

// Stealth 플러그인 적용 (봇 탐지 우회)
puppeteer.use(StealthPlugin());

// 시스템에서 Chrome/Chromium 경로 찾기
function findChromePath(): string {
  const paths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const p of paths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {}
  }

  // which 명령어로 찾기
  try {
    const result = execSync('which chromium-browser || which chromium || which google-chrome 2>/dev/null', { encoding: 'utf8' });
    return result.trim();
  } catch {}

  return '/usr/bin/chromium-browser';
}

class CoupangCrawler {
  private browser: Browser | null = null;
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const config = db.getConfig();
    const chromePath = findChromePath();
    console.log(`[Crawler] Chrome 경로: ${chromePath}`);

    this.browser = await puppeteer.launch({
      headless: config.headless ? 'new' : false,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });

    this.isInitialized = true;
    console.log('[Crawler] 브라우저 초기화 완료');
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      console.log('[Crawler] 브라우저 종료');
    }
  }

  // 사람처럼 무작위 딜레이 추가
  private async randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // 사람처럼 스크롤
  private async humanLikeScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );

      let currentPosition = 0;
      const step = Math.floor(Math.random() * 200) + 100;

      while (currentPosition < scrollHeight / 3) {
        currentPosition += step;
        window.scrollTo(0, currentPosition);
        await delay(Math.floor(Math.random() * 100) + 50);
      }
    });
  }

  // 사람처럼 마우스 이동
  private async humanLikeMouseMove(page: Page): Promise<void> {
    const viewportSize = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * viewportSize.width);
      const y = Math.floor(Math.random() * viewportSize.height);
      await page.mouse.move(x, y);
      await this.randomDelay(100, 300);
    }
  }

  // 쿠팡 상품 페이지에서 판매자 정보 크롤링
  async crawlSellerInfo(url: string): Promise<CrawlResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();

    try {
      // 쿠키 및 추가 헤더 설정
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });

      // 페이지 로드 전 랜덤 딜레이
      await this.randomDelay(500, 1500);

      console.log(`[Crawler] 페이지 로드 시작: ${url}`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 페이지 로드 후 사람처럼 행동
      await this.randomDelay(1000, 2000);
      await this.humanLikeMouseMove(page);
      await this.humanLikeScroll(page);
      await this.randomDelay(500, 1000);

      // 판매자 정보 추출
      // 스크린샷에서 확인된 셀렉터 기반
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

        // 방법 3: twc-flex 클래스 기반 셀렉터 (스크린샷에서 확인)
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

      // 상품 간 랜덤 딜레이 (3~7초)
      if (urls.indexOf(url) < urls.length - 1) {
        await this.randomDelay(3000, 7000);
      }
    }

    return results;
  }

  // 브라우저 상태 확인
  isReady(): boolean {
    return this.isInitialized && this.browser !== null;
  }
}

export const crawler = new CoupangCrawler();
export default crawler;
