import { DefaultProcessor } from '../default.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService } from '../../database';
import { conversationContextService } from '../../conversation-context';
import { intentService } from '../../database/intent.service';
import { Customer } from '../../../generated/prisma';

// Mock dependencies
jest.mock('../../database');
jest.mock('../../conversation-context');
jest.mock('../../database/intent.service');
jest.mock('../../llm', () => {
  const mockGenerateResponse = jest.fn();
  return {
    LLMService: jest.fn().mockImplementation(() => ({
      generateResponse: mockGenerateResponse
    })),
    __mockGenerateResponse: mockGenerateResponse
  };
});
jest.mock('../../../utils/logger');

describe('DefaultProcessor', () => {
  let processor: DefaultProcessor;
  let mockCustomerService: jest.Mocked<typeof customerService>;
  let mockConversationContextService: jest.Mocked<typeof conversationContextService>;
  let mockIntentService: jest.Mocked<typeof intentService>;

  const mockCustomer: Partial<Customer> = {
    id: 'cust-123',
    lineUserId: 'test-user-123',
    lineUserName: '김테스트',
    teamName: '부산 타이거즈',
    sportType: 'BASEBALL',
    brand: 'ILB_MAX',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockContext: ProcessorContext = {
    userId: 'test-user-123',
    message: '샘플 신청하고 싶어요',
    intent: {
      intentName: 'sample.request',
      confidence: 0.85,
      parameters: {
        requestType: 'sample'
      },
      queryText: '샘플 신청하고 싶어요',
      allRequiredParamsPresent: true
    } as IntentDetectionResult,
    conversationId: 'conv-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementation
    const { __mockGenerateResponse } = require('../../llm');
    __mockGenerateResponse.mockResolvedValue({
      success: true,
      content: 'Mocked LLM response'
    });

    processor = new DefaultProcessor();

    mockCustomerService = customerService as jest.Mocked<typeof customerService>;
    mockConversationContextService = conversationContextService as jest.Mocked<typeof conversationContextService>;
    mockIntentService = intentService as jest.Mocked<typeof intentService>;

    // Default mocks
    mockIntentService.getResponseStrategy.mockResolvedValue({
      strategy: 'DYNAMIC',
      cacheEnabled: false,
      contextRequired: []
    });
  });

  describe('gatherContext', () => {
    it('should gather customer and conversation context', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer as Customer);
      mockConversationContextService.getConversationInfo.mockResolvedValue({
        id: 'conv-123',
        customerId: 'test-user-123',
        sessionId: 'session-123',
        messages: [],
        status: 'ACTIVE',
        startedAt: new Date(),
        endedAt: null,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(mockContext);

      expect(gatheredData).toMatchObject({
        customerName: '김테스트',
        teamName: '부산 타이거즈',
        sportType: 'BASEBALL',
        brand: 'ILB_MAX',
        conversationStatus: 'ACTIVE',
        parameters: {
          requestType: 'sample'
        }
      });
    });

    it('should handle missing customer', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(null);

      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(mockContext);

      expect(gatheredData).toMatchObject({
        parameters: {
          requestType: 'sample'
        }
      });

      expect(gatheredData.teamName).toBeUndefined();
      expect(gatheredData.sportType).toBeUndefined();
    });

    it('should handle missing conversation info', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer as Customer);
      mockConversationContextService.getConversationInfo.mockResolvedValue(null);

      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(mockContext);

      expect(gatheredData.conversationStatus).toBeUndefined();
    });

    it('should handle context without conversationId', async () => {
      const contextWithoutConvId = { ...mockContext, conversationId: undefined };
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer as Customer);

      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(contextWithoutConvId);

      expect(gatheredData).toMatchObject({
        customerName: '김테스트',
        teamName: '부산 타이거즈'
      });
      expect(gatheredData.conversationStatus).toBeUndefined();
      expect(mockConversationContextService.getConversationInfo).not.toHaveBeenCalled();
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt with customer info', () => {
      const gatheredData = {
        teamName: '부산 타이거즈',
        sportType: 'BASEBALL',
        brand: 'ILB_MAX',
        parameters: {
          requestType: 'sample'
        }
      };

      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);

      expect(prompt).toContain('당신은 Kalron 스포츠 유니폼 전문 상담사입니다');
      expect(prompt).toContain('팀명: 부산 타이거즈');
      expect(prompt).toContain('종목: BASEBALL');
      expect(prompt).toContain('브랜드: ILB_MAX');
      expect(prompt).toContain('고객의 의도: sample.request');
      expect(prompt).toContain('고객 메시지: "샘플 신청하고 싶어요"');
      expect(prompt).toContain('requestType: sample');
    });

    it('should build prompt without customer info', () => {
      const gatheredData = {};

      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);

      expect(prompt).toContain('당신은 Kalron 스포츠 유니폼 전문 상담사입니다');
      expect(prompt).toContain('고객의 의도: sample.request');
      expect(prompt).not.toContain('팀명:');
      expect(prompt).not.toContain('종목:');
    });

    it('should include parameters when available', () => {
      const gatheredData = {
        parameters: {
          color: 'red',
          size: 'large',
          quantity: 10
        }
      };

      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);

      expect(prompt).toContain('추출된 정보:');
      expect(prompt).toContain('color: red');
      expect(prompt).toContain('size: large');
      expect(prompt).toContain('quantity: 10');
    });

    it('should not include parameters section when empty', () => {
      const gatheredData = {
        parameters: {}
      };

      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);

      expect(prompt).not.toContain('추출된 정보:');
    });
  });

  describe('postProcess', () => {
    it('should trim response', async () => {
      const response = '  \n\n처리된 응답  \n';
      // @ts-expect-error - accessing protected method for testing
      const processed = await processor.postProcess(response, mockContext, {});

      expect(processed).toBe('처리된 응답');
    });

    it('should not modify response for ILB_MAX brand', async () => {
      const gatheredData = { brand: 'ILB_MAX' };
      const response = '야구 유니폼 관련 응답입니다.';

      // @ts-expect-error - accessing protected method for testing
      const processed = await processor.postProcess(response, mockContext, gatheredData);

      expect(processed).toBe(response);
    });

    it('should not modify response for MAX2MAX brand', async () => {
      const gatheredData = { brand: 'MAX2MAX' };
      const response = '축구 유니폼 관련 응답입니다.';

      // @ts-expect-error - accessing protected method for testing
      const processed = await processor.postProcess(response, mockContext, gatheredData);

      expect(processed).toBe(response);
    });
  });

  describe('Integration test', () => {
    it('should process default intent end-to-end', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer as Customer);
      mockConversationContextService.getConversationInfo.mockResolvedValue({
        id: 'conv-123',
        customerId: 'test-user-123',
        sessionId: 'session-123',
        messages: [],
        status: 'ACTIVE',
        startedAt: new Date(),
        endedAt: null,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Mock LLM response
      const { __mockGenerateResponse } = require('../../llm');
      __mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '샘플 신청을 도와드리겠습니다. 어떤 종목의 샘플을 원하시나요?'
      });

      const response = await processor.process(mockContext);

      expect(response.success).toBe(true);
      expect(response.message).toContain('샘플 신청을 도와드리겠습니다');
      expect(response.metadata?.source).toBe('llm');
    });

    it('should handle various intent types', async () => {
      const contexts = [
        {
          ...mockContext,
          intent: {
            ...mockContext.intent,
            intentName: 'delivery.status',
            parameters: { orderNumber: '12345' }
          }
        },
        {
          ...mockContext,
          intent: {
            ...mockContext.intent,
            intentName: 'team.inquiry',
            parameters: { teamName: '서울팀' }
          }
        },
        {
          ...mockContext,
          intent: {
            ...mockContext.intent,
            intentName: 'unknown.intent',
            parameters: {}
          }
        }
      ];

      mockCustomerService.findByLineUserId.mockResolvedValue(null);

      const { __mockGenerateResponse } = require('../../llm');
      __mockGenerateResponse
        .mockResolvedValueOnce({ success: true, content: '배송 상태 확인' })
        .mockResolvedValueOnce({ success: true, content: '팀 정보 안내' })
        .mockResolvedValueOnce({ success: true, content: '일반 응답' });

      for (const context of contexts) {
        const response = await processor.process(context);
        expect(response.success).toBe(true);
        expect(response.metadata?.source).toBe('llm');
      }

      expect(__mockGenerateResponse).toHaveBeenCalledTimes(3);
    });
  });
});