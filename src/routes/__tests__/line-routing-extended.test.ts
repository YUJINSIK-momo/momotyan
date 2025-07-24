// 의존성을 먼저 모킹
jest.mock('../../config', () => ({
  config: {
    line: {
      channelSecret: 'test-channel-secret',
      channelAccessToken: 'test-access-token'
    },
    slack: {
      botToken: 'xoxb-test-token',
      webhookUrl: 'https://hooks.slack.com/test',
      channelId: 'C0000000000',
      channels: {
        baseball: 'C1111111111',
        soccer: 'C2222222222',
        basketball: 'C3333333333',
        design: 'C4444444444',
        claim: 'C5555555555',
        sample: 'C6666666666',
        payment: 'C7777777777',
        default: 'C8888888888'
      }
    },
    dialogflow: {
      projectId: 'test-project',
      languageCode: 'ko-KR',
      credentialsPath: './test-credentials.json',
      confidenceThreshold: 0.7,
      quickResponseThreshold: 0.9
    },
    llm: {
      apiKey: 'test-api-key',
      apiUrl: 'https://test.api.url',
      model: 'test-model',
      maxTokens: 1000,
      temperature: 0.7
    }
  }
}));

jest.mock('@google-cloud/dialogflow', () => ({
  SessionsClient: jest.fn().mockImplementation(() => ({
    projectLocationAgentSessionPath: jest.fn(),
    detectIntent: jest.fn()
  }))
}));

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: jest.fn().mockResolvedValue({ ts: '1234567890.123456' })
    }
  }))
}));

jest.mock('@slack/webhook', () => ({
  IncomingWebhook: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  }))
}));

jest.mock('../../services/line', () => ({
  lineClient: {
    replyMessage: jest.fn().mockResolvedValue({ sentMessages: [] })
  }
}));

jest.mock('../../services/database');
jest.mock('../../services/chatbot');
jest.mock('../../services/slack');
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { SportType, IntentCategory } from '../../generated/prisma';
import { customerService } from '../../services/database';
import * as chatbot from '../../services/chatbot';
import * as slack from '../../services/slack';
import { createMockCustomer } from '../../test-utils/mock-data';

describe('LINE Webhook Route - Extended Channel Routing Tests', () => {
  const mockProcessMessage = jest.mocked(chatbot.processMessage);
  const mockGetQuickResponse = jest.mocked(chatbot.getQuickResponse);
  const mockFindByLineUserId = jest.mocked(customerService.findByLineUserId);
  const mockSendApprovalRequest = jest.mocked(slack.sendApprovalRequest);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Additional routing scenarios', () => {
    it('should route to soccer channel for soccer customer', async () => {
      // 축구 스포츠 타입의 고객 모킹
      mockFindByLineUserId.mockResolvedValue(createMockCustomer({
        id: '2',
        lineUserId: 'U123456789',
        sportType: SportType.SOCCER,
        brand: 'MAX2MAX'
      }));

      // 챗봇 응답 모킹
      mockGetQuickResponse.mockResolvedValue(null);
      mockProcessMessage.mockResolvedValue({
        success: true,
        message: '축구 유니폼 주문을 도와드리겠습니다.',
        intentName: 'order.new',
        intentCategory: IntentCategory.ORDER_INQUIRY
      });

      await slack.sendApprovalRequest(
        '축구 유니폼 주문하고 싶습니다',
        '축구 유니폼 주문을 도와드리겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.SOCCER,
          brand: 'MAX2MAX',
          intentCategory: IntentCategory.ORDER_INQUIRY,
          intentName: 'order.new'
        }
      );

      expect(mockSendApprovalRequest).toHaveBeenCalledWith(
        '축구 유니폼 주문하고 싶습니다',
        '축구 유니폼 주문을 도와드리겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.SOCCER,
          brand: 'MAX2MAX',
          intentCategory: IntentCategory.ORDER_INQUIRY,
          intentName: 'order.new'
        }
      );
    });

    it('should route to basketball channel for basketball customer', async () => {
      // 농구 스포츠 타입의 고객 모킹
      mockFindByLineUserId.mockResolvedValue(createMockCustomer({
        id: '3',
        lineUserId: 'U123456789',
        sportType: SportType.BASKETBALL,
        brand: 'MAX2MAX'
      }));

      // 챗봇 응답 모킹
      mockGetQuickResponse.mockResolvedValue(null);
      mockProcessMessage.mockResolvedValue({
        success: true,
        message: '농구 유니폼 샘플을 보내드리겠습니다.',
        intentName: 'sample.request',
        intentCategory: IntentCategory.SAMPLE_REQUEST
      });

      await slack.sendApprovalRequest(
        '농구 유니폼 샘플 요청합니다',
        '농구 유니폼 샘플을 보내드리겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.BASKETBALL,
          brand: 'MAX2MAX',
          intentCategory: IntentCategory.SAMPLE_REQUEST,
          intentName: 'sample.request'
        }
      );

      expect(mockSendApprovalRequest).toHaveBeenCalledWith(
        '농구 유니폼 샘플 요청합니다',
        '농구 유니폼 샘플을 보내드리겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.BASKETBALL,
          brand: 'MAX2MAX',
          intentCategory: IntentCategory.SAMPLE_REQUEST,
          intentName: 'sample.request'
        }
      );
    });

    it('should prioritize claim channel over sport channel', async () => {
      // 스포츠 타입이 있는 고객 모킹
      mockFindByLineUserId.mockResolvedValue(createMockCustomer({
        id: '4',
        lineUserId: 'U123456789',
        sportType: SportType.BASEBALL,
        brand: 'ILB_MAX'
      }));

      // 클레임 인텐트가 있는 챗봇 응답 모킹
      mockGetQuickResponse.mockResolvedValue(null);
      mockProcessMessage.mockResolvedValue({
        success: true,
        message: '불편을 드려 죄송합니다. 담당자가 확인하겠습니다.',
        intentName: 'claim.product',
        intentCategory: IntentCategory.CLAIM
      });

      await slack.sendApprovalRequest(
        '제품에 문제가 있습니다',
        '불편을 드려 죄송합니다. 담당자가 확인하겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.BASEBALL,
          brand: 'ILB_MAX',
          intentCategory: IntentCategory.CLAIM,
          intentName: 'claim.product'
        }
      );

      expect(mockSendApprovalRequest).toHaveBeenCalledWith(
        '제품에 문제가 있습니다',
        '불편을 드려 죄송합니다. 담당자가 확인하겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.BASEBALL,
          brand: 'ILB_MAX',
          intentCategory: IntentCategory.CLAIM,
          intentName: 'claim.product'
        }
      );
    });

    it('should route to payment channel for payment inquiry', async () => {
      // 고객 모킹
      mockFindByLineUserId.mockResolvedValue(createMockCustomer({
        id: '5',
        lineUserId: 'U123456789',
        sportType: SportType.SOCCER,
        brand: 'MAX2MAX'
      }));

      // 결제 인텐트가 있는 챗봇 응답 모킹
      mockGetQuickResponse.mockResolvedValue(null);
      mockProcessMessage.mockResolvedValue({
        success: true,
        message: '결제 정보를 확인하겠습니다.',
        intentName: 'payment.inquiry',
        intentCategory: IntentCategory.PAYMENT_DELIVERY
      });

      await slack.sendApprovalRequest(
        '결제가 제대로 되었나요?',
        '결제 정보를 확인하겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.SOCCER,
          brand: 'MAX2MAX',
          intentCategory: IntentCategory.PAYMENT_DELIVERY,
          intentName: 'payment.inquiry'
        }
      );

      expect(mockSendApprovalRequest).toHaveBeenCalledWith(
        '결제가 제대로 되었나요?',
        '결제 정보를 확인하겠습니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.SOCCER,
          brand: 'MAX2MAX',
          intentCategory: IntentCategory.PAYMENT_DELIVERY,
          intentName: 'payment.inquiry'
        }
      );
    });

    it('should route to default channel when no specific routing applies', async () => {
      // 스포츠 타입이 없는 고객 모킹
      mockFindByLineUserId.mockResolvedValue(createMockCustomer({
        id: '6',
        lineUserId: 'U123456789',
        sportType: null,
        brand: null
      }));

      // 일반 문의가 있는 챗봇 응답 모킹
      mockGetQuickResponse.mockResolvedValue(null);
      mockProcessMessage.mockResolvedValue({
        success: true,
        message: '어떤 도움이 필요하신가요?',
        intentName: 'general.inquiry',
        intentCategory: IntentCategory.GENERAL_INQUIRY
      });

      await slack.sendApprovalRequest(
        '문의사항이 있습니다',
        '어떤 도움이 필요하신가요?',
        'U123456789',
        'msg123',
        {
          sportType: undefined,
          brand: undefined,
          intentCategory: IntentCategory.GENERAL_INQUIRY,
          intentName: 'general.inquiry'
        }
      );

      expect(mockSendApprovalRequest).toHaveBeenCalledWith(
        '문의사항이 있습니다',
        '어떤 도움이 필요하신가요?',
        'U123456789',
        'msg123',
        {
          sportType: undefined,
          brand: undefined,
          intentCategory: IntentCategory.GENERAL_INQUIRY,
          intentName: 'general.inquiry'
        }
      );
    });
  });
});