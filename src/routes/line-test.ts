import express, { Request, Response, Router } from 'express';
import * as line from '@line/bot-sdk';
import { config } from '../config';
import { detectIntent } from '../services/dialogflow';
import logger from '../utils/logger';
import { getLineChannelRouter, LineChannelInfo } from '../services/line-channel-router';

const router: Router = express.Router();
const lineChannelRouter = getLineChannelRouter();

// 동적 테스트 웹훅 핸들러 생성
function createTestWebhookHandler(channelInfo: LineChannelInfo) {
  const lineConfig: line.MiddlewareConfig = {
    channelSecret: channelInfo.channelSecret
  };

  return [
    line.middleware(lineConfig),
    async (req: Request, res: Response) => {
      try {
        const events = req.body.events;

        // 채널 정보를 포함하여 이벤트 처리
        const results = await Promise.all(
          events.map((event: line.WebhookEvent) => handleTestEvent(event, channelInfo))
        );

        res.json(results);
      } catch (err) {
        logger.error('Test webhook error', { error: err, channel: channelInfo.name });
        res.status(500).end();
      }
    }
  ];
}

// 기본 테스트 웹훅 엔드포인트 (하위 호환성)
if (config.line.channelSecret) {
  const defaultChannel = lineChannelRouter.getChannelById(config.line.channelId);
  if (defaultChannel) {
    const handlers = createTestWebhookHandler(defaultChannel);
    router.post('/webhook-test', handlers[0], handlers[1]);
  }
}

// 브랜드별 테스트 웹훅 엔드포인트
const ilbMaxChannel = lineChannelRouter.getChannelById(config.line.channels.ilbMax.channelId);
if (ilbMaxChannel) {
  const handlers = createTestWebhookHandler(ilbMaxChannel);
  router.post('/webhook-test/ilb-max', handlers[0], handlers[1]);
}

const max2maxChannel = lineChannelRouter.getChannelById(config.line.channels.max2max.channelId);
if (max2maxChannel) {
  const handlers = createTestWebhookHandler(max2maxChannel);
  router.post('/webhook-test/max2max', handlers[0], handlers[1]);
}

// 테스트 이벤트 핸들러
async function handleTestEvent(event: line.WebhookEvent, channelInfo: LineChannelInfo) {
  // 텍스트 메시지만 처리
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId || 'unknown';
  const customerMessage = event.message.text;
  const messageId = event.message.id;

  // 수신된 메시지 로깅
  logger.info('Test message received', {
    userId,
    message: customerMessage,
    messageId,
    channel: channelInfo.name,
    brand: channelInfo.brand
  });

  try {
    // Dialogflow로 인텐트 감지
    const intentResult = await detectIntent(customerMessage, userId);

    let replyMessage: string;

    if (!intentResult) {
      // Dialogflow 에러
      replyMessage = '⚠️ Dialogflow 연결 실패';
    } else if (intentResult.confidence < 0.5) {
      // 신뢰도 0.5 미만 - 폴백
      replyMessage = `❌ 폴백 처리
Intent: ${intentResult.intentName}
Confidence: ${intentResult.confidence.toFixed(2)}
Query: ${intentResult.queryText}`;
    } else {
      // 정상 응답
      replyMessage = `✅ Dialogflow 응답
Intent: ${intentResult.intentName}
Confidence: ${intentResult.confidence.toFixed(2)}
Parameters: ${JSON.stringify(intentResult.parameters, null, 2)}
${intentResult.fulfillmentText ? `\nResponse: ${intentResult.fulfillmentText}` : ''}`;
    }

    // 응답 메시지 생성
    const responseMessage: line.TextMessage = {
      type: 'text',
      text: replyMessage
    };

    // 채널별 LINE 클라이언트 사용
    const channelClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: channelInfo.channelAccessToken
    });

    return channelClient.replyMessage({
      replyToken: event.replyToken,
      messages: [responseMessage]
    });
  } catch (error) {
    logger.error('Failed to process test message', { error });

    // 에러 메시지 전송
    const errorMessage: line.TextMessage = {
      type: 'text',
      text: `❌ 시스템 에러: ${error instanceof Error ? error.message : 'Unknown error'}`
    };

    // 채널별 LINE 클라이언트 사용
    const channelClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: channelInfo.channelAccessToken
    });

    return channelClient.replyMessage({
      replyToken: event.replyToken,
      messages: [errorMessage]
    });
  }
}

export default router;