/**
 * 쿠팡 특화 탐지 우회 모듈
 * 쿠팡의 특정 봇 탐지 메커니즘에 대응
 */

import { Page, Browser } from 'puppeteer';

// 쿠팡에서 사용하는 탐지 스크립트 우회
export async function bypassCoupangDetection(page: Page): Promise<void> {
  console.log('[CoupangBypass] 쿠팡 특화 탐지 우회 적용 중...');

  await page.evaluateOnNewDocument(() => {
    // 쿠팡의 봇 탐지 스크립트가 체크하는 항목들 우회

    // 1. 봇 탐지 변수 제거
    const botProps = [
      '__nightmare',
      '_phantom',
      '__phantomas',
      'callPhantom',
      '_selenium',
      'callSelenium',
      '_Selenium_IDE_Recorder',
      'webdriver'
    ];

    botProps.forEach(prop => {
      try {
        Object.defineProperty(window, prop, {
          get: () => undefined,
          set: () => {},
          configurable: true
        });
      } catch (e) {}
    });

    // 2. Function.prototype.toString 보호 (함수 변조 탐지 방지)
    const originalFunctionToString = Function.prototype.toString;
    const nativeFunctionString = 'function toString() { [native code] }';

    Function.prototype.toString = function() {
      if (this === Function.prototype.toString) {
        return nativeFunctionString;
      }
      // 변조된 함수들도 native처럼 보이게
      const result = originalFunctionToString.call(this);
      if (result.includes('[native code]') || this.name === '') {
        return result;
      }
      return result;
    };

    // 3. Proxy 객체 탐지 방지
    const handler = {
      get: function(target: any, prop: string | symbol) {
        if (prop === Symbol.toStringTag) {
          return 'Object';
        }
        return target[prop];
      }
    };

    // 4. 쿠팡 DataDome/PerimeterX 유사 스크립트 우회
    // 마우스/키보드 이벤트 타이밍 정상화
    let lastEventTime = Date.now();

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(this: EventTarget, type: string, listener: any, options?: any) {
      const self = this;
      if (['mousemove', 'mousedown', 'mouseup', 'keydown', 'keyup', 'click'].includes(type)) {
        const wrappedListener = function(event: any) {
          // 이벤트 타임스탬프 정상화
          const now = Date.now();
          const timeDiff = now - lastEventTime;
          lastEventTime = now;

          // 비정상적으로 빠른 이벤트 간격 방지
          if (timeDiff < 10) {
            return; // 무시
          }

          return listener.call(self, event);
        };
        return originalAddEventListener.call(this, type, wrappedListener, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    // 5. Performance API 정상화 (타이밍 공격 방지)
    const originalNow = Performance.prototype.now;
    Performance.prototype.now = function() {
      return Math.round(originalNow.call(this));
    };

    // 6. Battery API 숨기기 (핑거프린팅 방지)
    if ('getBattery' in navigator) {
      Object.defineProperty(navigator, 'getBattery', {
        get: () => undefined,
        configurable: true
      });
    }

    // 7. 쿠팡의 reCAPTCHA/hCaptcha 관련 변수 정상화
    Object.defineProperty(window, 'grecaptcha', {
      get: () => undefined,
      set: () => {},
      configurable: true
    });

    // 8. 봇 탐지 스크립트가 사용하는 eval 체크 우회
    const originalEval = window.eval;
    (window as any).eval = function(code: string) {
      // 봇 탐지 코드에서 자주 사용하는 패턴 필터링
      if (code.includes('webdriver') || code.includes('phantom') || code.includes('selenium')) {
        return undefined;
      }
      return originalEval(code);
    };
    Object.defineProperty(window.eval, 'toString', {
      value: () => 'function eval() { [native code] }'
    });

    // 9. 디버거 탐지 방지
    Object.defineProperty(console, '_commandLineAPI', {
      get: function() {
        throw new Error('');
      }
    });

    // 10. 쿠팡 CDN에서 로드되는 스크립트의 타이밍 체크 우회
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    (window as any).setTimeout = function(callback: any, delay: number, ...args: any[]) {
      // 매우 짧은 타이밍 체크는 약간 지연
      if (delay < 50 && typeof callback === 'function') {
        delay = Math.max(delay, 50 + Math.random() * 100);
      }
      return originalSetTimeout(callback, delay, ...args);
    };

    (window as any).setInterval = function(callback: any, delay: number, ...args: any[]) {
      if (delay < 50 && typeof callback === 'function') {
        delay = Math.max(delay, 50 + Math.random() * 100);
      }
      return originalSetInterval(callback, delay, ...args);
    };
  });

  console.log('[CoupangBypass] 쿠팡 특화 탐지 우회 적용 완료');
}

/**
 * 쿠팡 쿠키 설정 (실제 방문자처럼 보이게)
 */
export async function setCoupangCookies(page: Page): Promise<void> {
  const cookies = [
    {
      name: 'PCID',
      value: generateRandomId(32),
      domain: '.coupang.com',
      path: '/'
    },
    {
      name: 'sid',
      value: generateRandomId(32),
      domain: '.coupang.com',
      path: '/'
    },
    {
      name: '_fbp',
      value: `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000)}`,
      domain: '.coupang.com',
      path: '/'
    },
    {
      name: '_ga',
      value: `GA1.2.${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000)}`,
      domain: '.coupang.com',
      path: '/'
    },
    {
      name: '_gid',
      value: `GA1.2.${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000)}`,
      domain: '.coupang.com',
      path: '/'
    },
    {
      name: 'x-coupang-accept-language',
      value: 'ko-KR',
      domain: '.coupang.com',
      path: '/'
    },
    {
      name: 'x-coupang-target-market',
      value: 'KR',
      domain: '.coupang.com',
      path: '/'
    }
  ];

  await page.setCookie(...cookies);
  console.log('[CoupangBypass] 쿠팡 쿠키 설정 완료');
}

/**
 * 쿠팡 메인 페이지 먼저 방문 (Referer 설정)
 */
export async function warmupCoupangSession(page: Page): Promise<void> {
  console.log('[CoupangBypass] 세션 워밍업 시작...');

  try {
    // 쿠팡 메인 페이지 방문
    await page.goto('https://www.coupang.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // 잠시 대기 (사람처럼)
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

    // 페이지 스크롤
    await page.evaluate(() => {
      window.scrollTo(0, 300 + Math.random() * 200);
    });

    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    console.log('[CoupangBypass] 세션 워밍업 완료');
  } catch (error) {
    console.log('[CoupangBypass] 세션 워밍업 실패 (계속 진행):', error);
  }
}

/**
 * 사람처럼 자연스러운 마우스 이동
 */
export async function humanMouseMovement(page: Page, targetX: number, targetY: number): Promise<void> {
  const startX = Math.random() * 500;
  const startY = Math.random() * 500;

  // 베지어 곡선으로 자연스러운 이동
  const steps = 20 + Math.floor(Math.random() * 10);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 약간의 곡선 추가
    const easeT = t * t * (3 - 2 * t); // smoothstep
    const x = startX + (targetX - startX) * easeT + (Math.random() - 0.5) * 10;
    const y = startY + (targetY - startY) * easeT + (Math.random() - 0.5) * 10;

    await page.mouse.move(x, y);
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 15));
  }
}

/**
 * 자연스러운 스크롤 동작
 */
export async function humanScroll(page: Page): Promise<void> {
  const scrollAmount = 200 + Math.floor(Math.random() * 300);
  const scrollSteps = 10 + Math.floor(Math.random() * 10);
  const stepSize = scrollAmount / scrollSteps;

  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate((step) => {
      window.scrollBy(0, step);
    }, stepSize);

    // 불규칙한 타이밍
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 70));
  }
}

/**
 * 자연스러운 타이핑 시뮬레이션
 */
export async function humanTyping(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });

    // 가끔 더 긴 멈춤 (생각하는 것처럼)
    if (Math.random() < 0.1) {
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    }
  }
}

/**
 * 랜덤 ID 생성
 */
function generateRandomId(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 쿠팡 봇 차단 페이지 감지
 */
export async function detectBotBlock(page: Page): Promise<boolean> {
  const isBlocked = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    const title = document.title?.toLowerCase() || '';

    // 봇 차단 페이지 패턴들
    const blockPatterns = [
      'access denied',
      '접근이 거부',
      '차단',
      'blocked',
      'captcha',
      '보안 문자',
      '자동화된 접근',
      'automated access',
      'unusual traffic',
      '비정상적인 트래픽',
      'please verify',
      '확인해 주세요',
      'robot',
      '로봇'
    ];

    for (const pattern of blockPatterns) {
      if (bodyText.includes(pattern) || title.includes(pattern)) {
        return true;
      }
    }

    // reCAPTCHA나 hCaptcha 프레임 확인
    const captchaFrames = document.querySelectorAll(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="captcha"]'
    );
    if (captchaFrames.length > 0) {
      return true;
    }

    return false;
  });

  if (isBlocked) {
    console.log('[CoupangBypass] 봇 차단 페이지 감지됨!');
  }

  return isBlocked;
}

/**
 * 페이지 새로고침으로 재시도
 */
export async function retryOnBlock(page: Page, url: string, maxRetries: number = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[CoupangBypass] 재시도 ${attempt}/${maxRetries}...`);

    // 대기 시간 증가 (지수 백오프)
    const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 2000;
    console.log(`[CoupangBypass] ${Math.round(waitTime / 1000)}초 대기 후 재시도...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // 쿠키 새로 설정
    await setCoupangCookies(page);

    // 페이지 이동
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 인간 행동 시뮬레이션
    await humanScroll(page);
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    // 차단 여부 확인
    const isBlocked = await detectBotBlock(page);
    if (!isBlocked) {
      console.log('[CoupangBypass] 재시도 성공!');
      return true;
    }
  }

  console.log('[CoupangBypass] 모든 재시도 실패');
  return false;
}

export default {
  bypassCoupangDetection,
  setCoupangCookies,
  warmupCoupangSession,
  humanMouseMovement,
  humanScroll,
  humanTyping,
  detectBotBlock,
  retryOnBlock
};
