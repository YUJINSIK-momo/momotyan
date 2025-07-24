import express, { Request, Response, Router } from 'express';
import * as line from '@line/bot-sdk';
import { config } from '../config';
import { sendApprovalRequest } from '../services/slack';
import { processMessage, getQuickResponse } from '../services/chatbot';
import logger from '../utils/logger';
import { customerService, customerJourneyService } from '../services/database';
import { IntentCategory, CustomerJourneyStage } from '../generated/prisma';
import { getLineChannelRouter, LineChannelInfo } from '../services/line-channel-router';
import { getLineUserProfile } from '../services/line';

const router: Router = express.Router();
const lineChannelRouter = getLineChannelRouter();

/**
 * @swagger
 * /webhook:
 *   post:
 *     summary: LINE webhook endpoint
 *     description: Receives messages from LINE platform and processes them through the chatbot
 *     tags: [LINE]
 *     security:
 *       - lineSignature: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               events:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "message"
 *                     replyToken:
 *                       type: string
 *                     source:
 *                       type: object
 *                       properties:
 *                         userId:
 *                           type: string
 *                         type:
 *                           type: string
 *                           example: "user"
 *                     message:
 *                       type: object
 *                       properties:
 *                         type:
 *                           type: string
 *                           example: "text"
 *                         text:
 *                           type: string
 *                           example: "동경 라이온즈입니다"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       500:
 *         description: Server error
 */
// 동적 웹훅 핸들러 생성
function createWebhookHandler(channelInfo: LineChannelInfo) {
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
          events.map((event: line.WebhookEvent) => handleEvent(event, channelInfo))
        );

        res.json(results);
      } catch (err) {
        logger.error('Webhook error', { error: err, channel: channelInfo.name });
        res.status(500).end();
      }
    }
  ];
}

// 기본 웹훅 엔드포인트 (하위 호환성)
if (config.line.channelSecret) {
  const defaultChannel = lineChannelRouter.getChannelById(config.line.channelId);
  if (defaultChannel) {
    const handlers = createWebhookHandler(defaultChannel);
    router.post('/webhook', handlers[0], handlers[1]);
  }
}

// 브랜드별 웹훅 엔드포인트
const ilbMaxChannel = lineChannelRouter.getChannelById(config.line.channels.ilbMax.channelId);
if (ilbMaxChannel) {
  const handlers = createWebhookHandler(ilbMaxChannel);
  router.post('/webhook/ilb-max', handlers[0], handlers[1]);
}

const max2maxChannel = lineChannelRouter.getChannelById(config.line.channels.max2max.channelId);
if (max2maxChannel) {
  const handlers = createWebhookHandler(max2maxChannel);
  router.post('/webhook/max2max', handlers[0], handlers[1]);
}

// 이벤트 핸들러
async function handleEvent(event: line.WebhookEvent, channelInfo: LineChannelInfo) {
  const userId = event.source.userId || 'unknown';

  // Follow 이벤트 처리
  if (event.type === 'follow') {
    try {
      // 1. LINE 프로필 가져오기
      const profile = await getLineUserProfile(userId);

      // 2. Customer 생성
      const customer = await customerService.createFromLineFollow(
        userId,
        profile,
        channelInfo.brand
      );

      // 3. Customer Journey 시작
      await customerJourneyService.updateJourneyStage(
        customer.id,
        CustomerJourneyStage.FRIEND_ADDED
      );

      // 4. 환영 메시지 전송
      const welcomeMessage: line.TextMessage = {
        type: 'text',
        text: `안녕하세요! ${channelInfo.name}을(를) 친구 추가해 주셔서 감사합니다! 🎉\n\n저희는 야구, 축구, 농구 등 다양한 스포츠 팀의 맞춤 유니폼을 제작하고 있습니다.\n\n무엇을 도와드릴까요?`
      };

      const channelClient = new line.messagingApi.MessagingApiClient({
        channelAccessToken: channelInfo.channelAccessToken
      });

      return channelClient.replyMessage({
        replyToken: event.replyToken,
        messages: [welcomeMessage]
      });
    } catch (error) {
      logger.error('Failed to handle follow event', { userId, error });
      return null;
    }
  }

  // Unfollow 이벤트 처리
  if (event.type === 'unfollow') {
    try {
      await customerService.updateFriendStatus(userId, 'BLOCKED');
      logger.info('Customer unfollowed', { userId });
    } catch (error) {
      logger.error('Failed to handle unfollow event', { userId, error });
    }
    return null;
  }

  // 텍스트 메시지만 처리
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const customerMessage = event.message.text;
  const messageId = event.message.id;

  // 수신된 메시지 로깅
  logger.info('Message received', {
    userId,
    message: customerMessage,
    messageId,
    channel: channelInfo.name,
    brand: channelInfo.brand
  });

  try {
    // 빠른 응답 확인 (자주 묻는 질문 등)
    const quickResponse = await getQuickResponse(customerMessage, { userId });

    let suggestedReply: string;
    let intentCategory: IntentCategory | undefined;
    let intentName: string | undefined;

    if (quickResponse && quickResponse.success) {
      // 빠른 응답 사용
      suggestedReply = quickResponse.message;
      intentCategory = quickResponse.intentCategory;
      intentName = quickResponse.intentName;
    } else {
      // Dialogflow + LLM을 통한 응답 생성
      const chatbotResponse = await processMessage(customerMessage, {
        userId,
        sessionId: userId, // LINE userId를 세션 ID로 사용
        useContext: true
      });

      if (chatbotResponse.success) {
        suggestedReply = chatbotResponse.message;
        intentCategory = chatbotResponse.intentCategory;
        intentName = chatbotResponse.intentName;
      } else {
        suggestedReply = '죄송합니다. 담당자가 확인 후 신속히 답변드리겠습니다.';
      }
    }

    // 고객 정보 조회 (스포츠 타입 및 브랜드 확인)
    let customer;
    try {
      customer = await customerService.findByLineUserId(userId);

      // 고객이 없으면 생성 (메시지를 통한 첫 접촉)
      if (!customer) {
        logger.info('Creating customer from first message', { userId });

        // LINE 프로필 가져오기
        const profile = await getLineUserProfile(userId);

        // Customer 생성
        customer = await customerService.createFromLineFollow(
          userId,
          profile,
          channelInfo.brand
        );

        // Customer Journey 시작 (FIRST_MESSAGE로 바로 시작)
        await customerJourneyService.updateJourneyStage(
          customer.id,
          CustomerJourneyStage.FIRST_MESSAGE
        );
      }
    } catch (error) {
      logger.warn('Failed to fetch or create customer info', { userId, error });
    }

    // 채널 라우팅을 위한 컨텍스트 구성
    const routingOptions = {
      sportType: customer?.sportType || channelInfo.sportType || undefined,
      brand: customer?.brand || channelInfo.brand || undefined,
      intentCategory,
      intentName,
      lineChannelName: channelInfo.name
    };

    // Slack으로 승인 요청 전송 (메타데이터 포함)
    await sendApprovalRequest(
      customerMessage,
      suggestedReply,
      userId,
      messageId,
      routingOptions
    );

    // 처리 중 메시지 전송
    const waitingMessage: line.TextMessage = {
      type: 'text',
      text: '문의해 주셔서 감사합니다. 잠시만 기다려 주세요.' // 문의 감사합니다. 잠시만 기다려 주세요.
    };

    // 채널별 LINE 클라이언트 사용
    const channelClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: channelInfo.channelAccessToken
    });

    return channelClient.replyMessage({
      replyToken: event.replyToken,
      messages: [waitingMessage]
    });
  } catch (error) {
    logger.error('Failed to process message', { error });

    // 에러 메시지 전송
    const errorMessage: line.TextMessage = {
      type: 'text',
      text: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' // 시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
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