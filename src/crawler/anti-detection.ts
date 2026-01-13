/**
 * 고급 안티-탐지 모듈
 * 쿠팡의 봇 탐지 시스템을 우회하기 위한 다양한 기술들을 구현
 */

import { Page, Browser, CDPSession } from 'puppeteer';

// 실제 Chrome 브라우저의 User-Agent 목록 (최신 버전들)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

// WebGL 렌더러 목록 (실제 GPU 이름들)
const WEBGL_RENDERERS = [
  'ANGLE (NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
];

// WebGL 벤더 목록
const WEBGL_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (Intel)',
  'Google Inc. (AMD)',
];

export interface AntiDetectionConfig {
  userAgent?: string;
  webglVendor?: string;
  webglRenderer?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  platform?: string;
  languages?: string[];
}

/**
 * 랜덤 요소 선택
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * CDP를 통한 고급 속성 숨기기
 */
export async function applyCDPTweaks(page: Page): Promise<void> {
  const client = await page.createCDPSession();

  // Runtime.enable 먼저 호출
  await client.send('Runtime.enable');

  // navigator.webdriver 속성 제거
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      // webdriver 속성 삭제
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });

      // Chrome 객체 추가 (실제 Chrome에는 있음)
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };

      // Permissions API 스푸핑
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    `
  });

  await client.detach();
}

/**
 * Navigator 속성 스푸핑
 */
export async function spoofNavigatorProperties(page: Page, config?: AntiDetectionConfig): Promise<void> {
  const userAgent = config?.userAgent || randomChoice(USER_AGENTS);
  const hardwareConcurrency = config?.hardwareConcurrency || (Math.floor(Math.random() * 4) + 4); // 4-8
  const deviceMemory = config?.deviceMemory || randomChoice([4, 8, 16]);
  const platform = config?.platform || 'Win32';
  const languages = config?.languages || ['ko-KR', 'ko', 'en-US', 'en'];

  await page.evaluateOnNewDocument((params) => {
    // User-Agent 스푸핑
    Object.defineProperty(navigator, 'userAgent', {
      get: () => params.userAgent,
      configurable: true
    });

    // Platform 스푸핑
    Object.defineProperty(navigator, 'platform', {
      get: () => params.platform,
      configurable: true
    });

    // 언어 설정
    Object.defineProperty(navigator, 'languages', {
      get: () => params.languages,
      configurable: true
    });

    Object.defineProperty(navigator, 'language', {
      get: () => params.languages[0],
      configurable: true
    });

    // 하드웨어 동시성
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => params.hardwareConcurrency,
      configurable: true
    });

    // 디바이스 메모리
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => params.deviceMemory,
      configurable: true
    });

    // maxTouchPoints (데스크톱은 0)
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
      configurable: true
    });

    // Connection 정보
    Object.defineProperty(navigator, 'connection', {
      get: () => ({
        effectiveType: '4g',
        rtt: 50,
        downlink: 10,
        saveData: false
      }),
      configurable: true
    });

    // 플러그인 스푸핑 (실제 Chrome처럼)
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        const pluginArray = Object.create(PluginArray.prototype);
        plugins.forEach((p, i) => {
          const plugin = Object.create(Plugin.prototype);
          Object.defineProperties(plugin, {
            name: { value: p.name },
            filename: { value: p.filename },
            description: { value: p.description },
            length: { value: 0 }
          });
          pluginArray[i] = plugin;
        });
        Object.defineProperty(pluginArray, 'length', { value: plugins.length });
        return pluginArray;
      },
      configurable: true
    });

    // MimeTypes 스푸핑
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const mimeTypes = [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
        ];
        const mimeTypeArray = Object.create(MimeTypeArray.prototype);
        mimeTypes.forEach((m, i) => {
          const mimeType = Object.create(MimeType.prototype);
          Object.defineProperties(mimeType, {
            type: { value: m.type },
            suffixes: { value: m.suffixes },
            description: { value: m.description }
          });
          mimeTypeArray[i] = mimeType;
        });
        Object.defineProperty(mimeTypeArray, 'length', { value: mimeTypes.length });
        return mimeTypeArray;
      },
      configurable: true
    });
  }, { userAgent, platform, languages, hardwareConcurrency, deviceMemory });
}

/**
 * WebGL 핑거프린트 스푸핑
 */
export async function spoofWebGL(page: Page, config?: AntiDetectionConfig): Promise<void> {
  const vendor = config?.webglVendor || randomChoice(WEBGL_VENDORS);
  const renderer = config?.webglRenderer || randomChoice(WEBGL_RENDERERS);

  await page.evaluateOnNewDocument((params) => {
    // WebGL 정보 스푸핑
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) {
        return params.vendor;
      }
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) {
        return params.renderer;
      }
      return getParameter.call(this, parameter);
    };

    // WebGL2도 동일하게 처리
    const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return params.vendor;
      }
      if (parameter === 37446) {
        return params.renderer;
      }
      return getParameter2.call(this, parameter);
    };
  }, { vendor, renderer });
}

/**
 * Canvas 핑거프린트에 노이즈 추가
 */
export async function addCanvasNoise(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    // Canvas toDataURL에 미세한 노이즈 추가
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type?: string, quality?: any) {
      // 원본 데이터를 가져옴
      const result = originalToDataURL.call(this, type, quality);

      // 작은 캔버스에서만 노이즈 추가 (핑거프린팅 감지용)
      if (this.width < 300 && this.height < 300) {
        const ctx = this.getContext('2d');
        if (ctx) {
          // 미세한 노이즈 추가
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            // 매우 작은 노이즈 (눈에 안 보임)
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() - 0.5) * 2));
          }
          ctx.putImageData(imageData, 0, 0);
          return originalToDataURL.call(this, type, quality);
        }
      }
      return result;
    };

    // getImageData에도 노이즈 추가
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
      const imageData = originalGetImageData.call(this, sx, sy, sw, sh);

      // 작은 영역에서만 노이즈 추가
      if (sw < 300 && sh < 300) {
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() - 0.5) * 2));
        }
      }
      return imageData;
    };
  });
}

/**
 * 자동화 탐지 플래그 제거
 */
export async function removeAutomationFlags(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    // Headless 탐지 방지
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true
    });

    // window.navigator.webdriver 삭제
    delete (navigator as any).__proto__.webdriver;

    // Automation 관련 속성들 제거
    const automationProps = [
      'webdriver',
      '__webdriver_script_fn',
      '__driver_evaluate',
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__webdriver_unwrapped',
      '__selenium_unwrapped',
      '__fxdriver_unwrapped',
      '__webdriver_script_func',
      'calledSelenium',
      '_WEBDRIVER_ELEM_CACHE',
      'ChromeDriverw',
      '_selenium',
      '_Selenium_IDE_Recorder'
    ];

    automationProps.forEach(prop => {
      try {
        if ((window as any)[prop]) {
          delete (window as any)[prop];
        }
        if ((document as any)[prop]) {
          delete (document as any)[prop];
        }
      } catch (e) {}
    });

    // document.$cdc 삭제 (ChromeDriver 탐지)
    if ((document as any).$cdc_asdjflasutopfhvcZLmcfl_) {
      delete (document as any).$cdc_asdjflasutopfhvcZLmcfl_;
    }

    // 콜스택에서 자동화 흔적 제거
    const originalError = Error;
    (window as any).Error = function(...args: any[]) {
      const error = new originalError(...args);
      if (error.stack) {
        error.stack = error.stack.replace(/puppeteer|selenium|webdriver|chromedriver/gi, 'chrome');
      }
      return error;
    };
  });
}

/**
 * Screen/Window 속성 스푸핑
 */
export async function spoofScreenProperties(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    // 실제 모니터 해상도처럼 보이게
    const screenWidth = 1920;
    const screenHeight = 1080;

    Object.defineProperty(screen, 'width', { get: () => screenWidth });
    Object.defineProperty(screen, 'height', { get: () => screenHeight });
    Object.defineProperty(screen, 'availWidth', { get: () => screenWidth });
    Object.defineProperty(screen, 'availHeight', { get: () => screenHeight - 40 }); // 태스크바
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

    // window.outerWidth/outerHeight
    Object.defineProperty(window, 'outerWidth', { get: () => screenWidth });
    Object.defineProperty(window, 'outerHeight', { get: () => screenHeight });

    // window.screenX/screenY
    Object.defineProperty(window, 'screenX', { get: () => 0 });
    Object.defineProperty(window, 'screenY', { get: () => 0 });
  });
}

/**
 * iframe 및 postMessage 보호
 */
export async function protectIframes(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    // 모든 iframe에서도 같은 속성 적용
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName: string, options?: ElementCreationOptions) {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'iframe') {
        element.addEventListener('load', () => {
          try {
            const iframeWindow = (element as HTMLIFrameElement).contentWindow;
            if (iframeWindow) {
              Object.defineProperty(iframeWindow.navigator, 'webdriver', {
                get: () => false
              });
            }
          } catch (e) {}
        });
      }
      return element;
    };
  });
}

/**
 * 모든 안티-탐지 기술 적용
 */
export async function applyAllAntiDetection(page: Page, config?: AntiDetectionConfig): Promise<void> {
  console.log('[AntiDetection] 고급 안티-탐지 기술 적용 중...');

  // 순서대로 모든 보호 기술 적용
  await removeAutomationFlags(page);
  await spoofNavigatorProperties(page, config);
  await spoofWebGL(page, config);
  await addCanvasNoise(page);
  await spoofScreenProperties(page);
  await protectIframes(page);
  await applyCDPTweaks(page);

  console.log('[AntiDetection] 안티-탐지 기술 적용 완료');
}

/**
 * 브라우저 런치 옵션 생성
 */
export function getStealthLaunchOptions(headless: boolean = false, userDataDir?: string): object {
  const options: any = {
    headless: headless ? 'new' : false,
    args: [
      // 기본 보안 설정
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',

      // 자동화 플래그 비활성화
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',

      // GPU 및 렌더링
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-accelerated-2d-canvas',

      // 윈도우 설정
      '--window-size=1920,1080',
      '--start-maximized',

      // 언어 및 지역
      '--lang=ko-KR',
      '--accept-lang=ko-KR,ko,en-US,en',

      // 기타 플래그
      '--disable-infobars',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--ignore-certificate-errors',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',

      // WebRTC IP 누출 방지
      '--disable-webrtc-hw-encoding',
      '--disable-webrtc-hw-decoding',

      // 추가 은닉
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    ignoreDefaultArgs: ['--enable-automation'],
  };

  // 사용자 데이터 디렉토리 설정 (실제 프로필 사용)
  if (userDataDir) {
    options.userDataDir = userDataDir;
  }

  return options;
}

/**
 * 랜덤 User-Agent 가져오기
 */
export function getRandomUserAgent(): string {
  return randomChoice(USER_AGENTS);
}

export default {
  applyAllAntiDetection,
  applyCDPTweaks,
  spoofNavigatorProperties,
  spoofWebGL,
  addCanvasNoise,
  removeAutomationFlags,
  spoofScreenProperties,
  protectIframes,
  getStealthLaunchOptions,
  getRandomUserAgent,
  USER_AGENTS,
  WEBGL_RENDERERS,
  WEBGL_VENDORS
};
