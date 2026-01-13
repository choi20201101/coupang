import express, { Request, Response, Router } from 'express';
import { ApiResponse } from '../types';
import db from '../database';
import scheduler from '../scheduler';
import slackService from '../services/slack';

const router: Router = express.Router();

// JSON 파싱 미들웨어
router.use(express.json());

// ================== 상품 관리 API ==================

// 모든 상품 조회
router.get('/products', (req: Request, res: Response) => {
  try {
    const products = db.getProducts();
    const response: ApiResponse = {
      success: true,
      data: products
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상품 조회 실패'
    };
    res.status(500).json(response);
  }
});

// 활성 상품만 조회
router.get('/products/active', (req: Request, res: Response) => {
  try {
    const products = db.getActiveProducts();
    const response: ApiResponse = {
      success: true,
      data: products
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상품 조회 실패'
    };
    res.status(500).json(response);
  }
});

// 상품 추가
router.post('/products', (req: Request, res: Response) => {
  try {
    const { url, name, expectedSeller } = req.body;

    if (!url || !name || !expectedSeller) {
      const response: ApiResponse = {
        success: false,
        error: 'url, name, expectedSeller 필드가 필요합니다.'
      };
      return res.status(400).json(response);
    }

    // URL 유효성 검사
    if (!url.includes('coupang.com')) {
      const response: ApiResponse = {
        success: false,
        error: '유효한 쿠팡 URL이 아닙니다.'
      };
      return res.status(400).json(response);
    }

    const product = db.addProduct(url, name, expectedSeller);
    const response: ApiResponse = {
      success: true,
      data: product,
      message: '상품이 추가되었습니다.'
    };
    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상품 추가 실패'
    };
    res.status(500).json(response);
  }
});

// 상품 수정
router.put('/products/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { url, name, expectedSeller, isActive } = req.body;

    const success = db.updateProduct(id, { url, name, expectedSeller, isActive });

    if (!success) {
      const response: ApiResponse = {
        success: false,
        error: '상품을 찾을 수 없습니다.'
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: db.getProductById(id),
      message: '상품이 수정되었습니다.'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상품 수정 실패'
    };
    res.status(500).json(response);
  }
});

// 상품 삭제
router.delete('/products/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = db.deleteProduct(id);

    if (!success) {
      const response: ApiResponse = {
        success: false,
        error: '상품을 찾을 수 없습니다.'
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      message: '상품이 삭제되었습니다.'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상품 삭제 실패'
    };
    res.status(500).json(response);
  }
});

// 상품 활성화/비활성화 토글
router.patch('/products/:id/toggle', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = db.getProductById(id);

    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: '상품을 찾을 수 없습니다.'
      };
      return res.status(404).json(response);
    }

    db.updateProduct(id, { isActive: !product.isActive });

    const response: ApiResponse = {
      success: true,
      data: db.getProductById(id),
      message: `상품이 ${!product.isActive ? '활성화' : '비활성화'}되었습니다.`
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상품 토글 실패'
    };
    res.status(500).json(response);
  }
});

// 단일 상품 테스트 크롤링
router.post('/products/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await scheduler.testProduct(id);

    if (!result) {
      const response: ApiResponse = {
        success: false,
        error: '상품을 찾을 수 없습니다.'
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: result,
      message: result.isFraudulent ? '⚠️ 이상 판매자 감지!' : '✅ 정상 판매자'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '테스트 실패'
    };
    res.status(500).json(response);
  }
});

// ================== 모니터링 API ==================

// 모니터링 상태 조회
router.get('/monitoring/status', (req: Request, res: Response) => {
  try {
    const status = scheduler.getStatus();
    const response: ApiResponse = {
      success: true,
      data: status
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '상태 조회 실패'
    };
    res.status(500).json(response);
  }
});

// 모니터링 시작
router.post('/monitoring/start', async (req: Request, res: Response) => {
  try {
    await scheduler.start();
    const response: ApiResponse = {
      success: true,
      data: scheduler.getStatus(),
      message: '모니터링이 시작되었습니다.'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '모니터링 시작 실패'
    };
    res.status(500).json(response);
  }
});

// 모니터링 중지
router.post('/monitoring/stop', async (req: Request, res: Response) => {
  try {
    await scheduler.stop();
    const response: ApiResponse = {
      success: true,
      data: scheduler.getStatus(),
      message: '모니터링이 중지되었습니다.'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '모니터링 중지 실패'
    };
    res.status(500).json(response);
  }
});

// 즉시 검사 실행
router.post('/monitoring/run-now', async (req: Request, res: Response) => {
  try {
    await scheduler.runNow();
    const response: ApiResponse = {
      success: true,
      data: scheduler.getStatus(),
      message: '즉시 검사가 실행되었습니다.'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '즉시 검사 실패'
    };
    res.status(500).json(response);
  }
});

// ================== 결과/로그 API ==================

// 모니터링 결과 조회
router.get('/results', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const results = db.getMonitoringResults(limit);
    const response: ApiResponse = {
      success: true,
      data: results
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '결과 조회 실패'
    };
    res.status(500).json(response);
  }
});

// 이상 감지 결과만 조회
router.get('/results/fraudulent', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const results = db.getFraudulentResults(limit);
    const response: ApiResponse = {
      success: true,
      data: results
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '결과 조회 실패'
    };
    res.status(500).json(response);
  }
});

// 알림 로그 조회
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = db.getAlertLogs(limit);
    const response: ApiResponse = {
      success: true,
      data: logs
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '로그 조회 실패'
    };
    res.status(500).json(response);
  }
});

// ================== 설정 API ==================

// 설정 조회
router.get('/config', (req: Request, res: Response) => {
  try {
    const config = db.getConfig();
    // 웹훅 URL은 일부 마스킹
    const maskedConfig = {
      ...config,
      slackWebhookUrl: config.slackWebhookUrl
        ? config.slackWebhookUrl.substring(0, 30) + '...(마스킹됨)'
        : ''
    };
    const response: ApiResponse = {
      success: true,
      data: maskedConfig
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '설정 조회 실패'
    };
    res.status(500).json(response);
  }
});

// 설정 업데이트
router.put('/config', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    db.updateConfig(updates);
    const response: ApiResponse = {
      success: true,
      message: '설정이 업데이트되었습니다.'
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '설정 업데이트 실패'
    };
    res.status(500).json(response);
  }
});

// ================== 슬랙 API ==================

// 슬랙 테스트 메시지 전송
router.post('/slack/test', async (req: Request, res: Response) => {
  try {
    const result = await slackService.sendTestMessage();
    const response: ApiResponse = {
      success: result.success,
      message: result.success ? '테스트 메시지가 전송되었습니다.' : result.error
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '테스트 메시지 전송 실패'
    };
    res.status(500).json(response);
  }
});

// ================== 통계 API ==================

// 통계 조회
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = db.getStats();
    const monitoringStatus = scheduler.getStatus();
    const response: ApiResponse = {
      success: true,
      data: {
        ...stats,
        ...monitoringStatus
      }
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '통계 조회 실패'
    };
    res.status(500).json(response);
  }
});

export default router;
