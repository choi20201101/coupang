import express from 'express';
import path from 'path';
import apiRouter from './api';
import db from './database';
import scheduler from './scheduler';

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 서빙 (어드민 UI)
app.use(express.static(path.join(__dirname, '../public')));

// API 라우터
app.use('/api', apiRouter);

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 서버 시작
const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🛒 쿠팡 판매자 모니터링 시스템');
  console.log('='.repeat(50));
  console.log(`✅ 서버 시작: http://localhost:${PORT}`);
  console.log(`📊 어드민 UI: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log('='.repeat(50));

  // 초기 통계 출력
  const stats = db.getStats();
  console.log(`📦 등록된 상품: ${stats.totalProducts}개 (활성: ${stats.activeProducts}개)`);
  console.log(`🔍 총 검사 횟수: ${stats.totalChecks}회`);
  console.log(`⚠️ 이상 감지: ${stats.fraudulentFound}회`);
  console.log('='.repeat(50));

  // 설정 정보
  const config = db.getConfig();
  console.log('⚙️ 설정:');
  console.log(`   - 검사 간격: ${config.checkIntervalMinutes.min}~${config.checkIntervalMinutes.max}분 (±${config.checkIntervalVarianceSeconds}초)`);
  console.log(`   - 슬랙 채널: ${config.slackChannel}`);
  console.log(`   - 슬랙 웹훅: ${config.slackWebhookUrl ? '설정됨' : '미설정'}`);
  console.log('='.repeat(50));
  console.log('');
  console.log('💡 사용법:');
  console.log('   1. 웹 브라우저에서 http://localhost:' + PORT + ' 접속');
  console.log('   2. 설정에서 슬랙 웹훅 URL 입력');
  console.log('   3. 상품 추가 후 모니터링 시작');
  console.log('');
});

// 종료 처리
process.on('SIGINT', async () => {
  console.log('\n종료 중...');

  // 모니터링 중지
  await scheduler.stop();

  // DB 종료
  db.close();

  server.close(() => {
    console.log('서버가 종료되었습니다.');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n종료 중...');
  await scheduler.stop();
  db.close();
  server.close(() => {
    process.exit(0);
  });
});

// 예외 처리
process.on('uncaughtException', (error) => {
  console.error('예기치 않은 오류:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 Promise 거부:', reason);
});
