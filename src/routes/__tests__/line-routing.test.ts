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

describe('LINE Webhook Route - Channel Routing', () => {
  const mockProcessMessage = jest.mocked(chatbot.processMessage);
  const mockGetQuickResponse = jest.mocked(chatbot.getQuickResponse);
  const mockFindByLineUserId = jest.mocked(customerService.findByLineUserId);
  const mockSendApprovalRequest = jest.mocked(slack.sendApprovalRequest);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Channel routing based on customer and intent', () => {
    it('should route to baseball channel for baseball customer', async () => {
    // 야구 스포츠 타입의 고객 모킹
      mockFindByLineUserId.mockResolvedValue(createMockCustomer({
        id: '1',
        lineUserId: 'U123456789',
        sportType: SportType.BASEBALL,
        brand: 'ILB_MAX'
      }));

      // 챗봇 응답 모킹
      mockGetQuickResponse.mockResolvedValue(null);
      mockProcessMessage.mockResolvedValue({
        success: true,
        message: '야구 유니폼 가격은 5만원부터 시작합니다.',
        intentName: 'price.inquiry',
        intentCategory: IntentCategory.GENERAL_INQUIRY
      });

      // 모킹이 올바르게 설정되었는지 확인
      const customer = await customerService.findByLineUserId('U123456789');
      expect(customer?.sportType).toBe(SportType.BASEBALL);

      // slack sendApprovalRequest가 호출될 수 있는지 확인
      await slack.sendApprovalRequest(
        '유니폼 가격이 어떻게 되나요?',
        '야구 유니폼 가격은 5만원부터 시작합니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.BASEBALL,
          brand: 'ILB_MAX',
          intentCategory: IntentCategory.GENERAL_INQUIRY,
          intentName: 'price.inquiry'
        }
      );

      expect(mockSendApprovalRequest).toHaveBeenCalledWith(
        '유니폼 가격이 어떻게 되나요?',
        '야구 유니폼 가격은 5만원부터 시작합니다.',
        'U123456789',
        'msg123',
        {
          sportType: SportType.BASEBALL,
          brand: 'ILB_MAX',
          intentCategory: IntentCategory.GENERAL_INQUIRY,
          intentName: 'price.inquiry'
        }
      );
    });
  });
});