import axios from 'axios';
import { SlackMessage, SlackAttachment, MonitoringResult } from '../types';
import db from '../database';

class SlackService {
  // 슬랙 웹훅으로 메시지 전송
  async sendMessage(message: SlackMessage): Promise<{ success: boolean; response?: string; error?: string }> {
    const config = db.getConfig();

    if (!config.slackWebhookUrl) {
      console.error('[Slack] 웹훅 URL이 설정되지 않았습니다.');
      return { success: false, error: '슬랙 웹훅 URL이 설정되지 않았습니다.' };
    }

    try {
      const response = await axios.post(config.slackWebhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('[Slack] 메시지 전송 성공');
      return { success: true, response: String(response.data) };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Slack] 메시지 전송 실패: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  // 사기 판매자 감지 알림
  async sendFraudAlert(result: MonitoringResult): Promise<{ success: boolean; response?: string; error?: string }> {
    const config = db.getConfig();

    const attachment: SlackAttachment = {
      color: '#ff0000', // 빨간색 - 위험
      title: '🚨 쿠팡 판매자 이상 감지!',
      title_link: result.productUrl,
      fields: [
        {
          title: '상품명',
          value: result.productName || '알 수 없음',
          short: false
        },
        {
          title: '예상 판매자 (우리 판매자)',
          value: result.expectedSeller,
          short: true
        },
        {
          title: '실제 판매자 (이상 감지)',
          value: result.actualSeller || '알 수 없음',
          short: true
        },
        {
          title: '상품 URL',
          value: result.productUrl,
          short: false
        },
        {
          title: '판매자 링크',
          value: result.sellerLink || '없음',
          short: false
        },
        {
          title: '감지 시간',
          value: new Date(result.checkedAt).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          short: true
        }
      ],
      footer: '쿠팡 판매자 모니터링 시스템',
      ts: Math.floor(Date.now() / 1000)
    };

    const message: SlackMessage = {
      channel: config.slackChannel,
      username: '쿠팡 모니터링 봇',
      icon_emoji: ':warning:',
      attachments: [attachment],
      text: `<!channel> *긴급* - 등록되지 않은 판매자가 상품을 판매 중입니다!\n상품: ${result.productName || '알 수 없음'}\n실제 판매자: ${result.actualSeller || '알 수 없음'}`
    };

    return this.sendMessage(message);
  }

  // 모니터링 시작 알림
  async sendMonitoringStarted(): Promise<{ success: boolean; response?: string; error?: string }> {
    const config = db.getConfig();
    const stats = db.getStats();

    const message: SlackMessage = {
      channel: config.slackChannel,
      username: '쿠팡 모니터링 봇',
      icon_emoji: ':robot_face:',
      attachments: [{
        color: '#36a64f', // 녹색
        title: '✅ 쿠팡 판매자 모니터링 시작',
        fields: [
          {
            title: '활성 상품 수',
            value: `${stats.activeProducts}개`,
            short: true
          },
          {
            title: '총 등록 상품',
            value: `${stats.totalProducts}개`,
            short: true
          },
          {
            title: '검사 간격',
            value: `${config.checkIntervalMinutes.min}~${config.checkIntervalMinutes.max}분 (±${config.checkIntervalVarianceSeconds}초)`,
            short: false
          }
        ],
        footer: '쿠팡 판매자 모니터링 시스템',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return this.sendMessage(message);
  }

  // 모니터링 중지 알림
  async sendMonitoringStopped(): Promise<{ success: boolean; response?: string; error?: string }> {
    const config = db.getConfig();
    const stats = db.getStats();

    const message: SlackMessage = {
      channel: config.slackChannel,
      username: '쿠팡 모니터링 봇',
      icon_emoji: ':stop_sign:',
      attachments: [{
        color: '#ff9800', // 주황색
        title: '⏹️ 쿠팡 판매자 모니터링 중지',
        fields: [
          {
            title: '총 검사 횟수',
            value: `${stats.totalChecks}회`,
            short: true
          },
          {
            title: '이상 감지 횟수',
            value: `${stats.fraudulentFound}회`,
            short: true
          }
        ],
        footer: '쿠팡 판매자 모니터링 시스템',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return this.sendMessage(message);
  }

  // 일일 리포트
  async sendDailyReport(): Promise<{ success: boolean; response?: string; error?: string }> {
    const config = db.getConfig();
    const stats = db.getStats();
    const recentFrauds = db.getFraudulentResults(10);

    let fraudDetails = '';
    if (recentFrauds.length > 0) {
      fraudDetails = recentFrauds
        .slice(0, 5)
        .map((f, i) => `${i + 1}. ${f.productName || '알 수 없음'} - ${f.actualSeller || '알 수 없음'}`)
        .join('\n');
    } else {
      fraudDetails = '최근 이상 감지 내역 없음';
    }

    const message: SlackMessage = {
      channel: config.slackChannel,
      username: '쿠팡 모니터링 봇',
      icon_emoji: ':bar_chart:',
      attachments: [{
        color: '#2196f3', // 파란색
        title: '📊 일일 모니터링 리포트',
        fields: [
          {
            title: '활성 상품 수',
            value: `${stats.activeProducts}개`,
            short: true
          },
          {
            title: '총 검사 횟수',
            value: `${stats.totalChecks}회`,
            short: true
          },
          {
            title: '총 이상 감지',
            value: `${stats.fraudulentFound}회`,
            short: true
          },
          {
            title: '최근 이상 감지 내역',
            value: fraudDetails,
            short: false
          }
        ],
        footer: '쿠팡 판매자 모니터링 시스템',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return this.sendMessage(message);
  }

  // 테스트 메시지
  async sendTestMessage(): Promise<{ success: boolean; response?: string; error?: string }> {
    const config = db.getConfig();

    const message: SlackMessage = {
      channel: config.slackChannel,
      username: '쿠팡 모니터링 봇',
      icon_emoji: ':test_tube:',
      text: '🧪 테스트 메시지입니다. 슬랙 연동이 정상적으로 작동합니다!'
    };

    return this.sendMessage(message);
  }
}

export const slackService = new SlackService();
export default slackService;
