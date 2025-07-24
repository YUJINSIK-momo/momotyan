import { PriceInquiryProcessor } from '../price-inquiry.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService } from '../../database';
import { intentService } from '../../database/intent.service';
import { Customer, CustomerType } from '../../../generated/prisma';
// Mock dependencies
jest.mock('../../database');
jest.mock('../../database/intent.service');
jest.mock('../../conversation-context');
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
describe('PriceInquiryProcessor', () => {
  let processor: PriceInquiryProcessor;
  let mockCustomerService: jest.Mocked<typeof customerService>;
  let mockIntentService: jest.Mocked<typeof intentService>;
  const mockCustomer: Partial<Customer> = {
    id: 'cust-123',
    lineUserId: 'test-user-123',
    lineUserName: '테스트팀',
    teamName: '서울 라이온즈',
    sportType: 'BASEBALL',
    brand: 'ILB_MAX',
    customerType: 'EXISTING' as CustomerType,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const mockContext: ProcessorContext = {
    userId: 'test-user-123',
    message: '야구 유니폼 가격이 얼마인가요?',
    intent: {
      intentName: 'price.inquiry',
      confidence: 0.95,
      parameters: {
        sport: '야구',
        quantity: 20
      },
      queryText: '야구 유니폼 가격이 얼마인가요?',
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

    processor = new PriceInquiryProcessor();

    mockCustomerService = customerService as jest.Mocked<typeof customerService>;
    mockIntentService = intentService as jest.Mocked<typeof intentService>;
    // Default mocks
    mockIntentService.getResponseStrategy.mockResolvedValue({
      strategy: 'DYNAMIC',
      cacheEnabled: false,
      contextRequired: []
    });
  });
  describe('gatherContext', () => {
    it('should gather customer context successfully', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer as Customer);
      // Access the protected method through a test helper
      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(mockContext);
      expect(gatheredData).toMatchObject({
        customerName: '테스트팀',
        teamName: '서울 라이온즈',
        sportType: 'BASEBALL',
        brand: 'ILB_MAX',
        isExistingCustomer: true,
        hasPreviousOrders: false,
        previousOrderCount: 0,
        requestedSport: '야구',
        requestedQuantity: 20,
        priceInfo: {
          sport: '야구',
          minPrice: 50000,
          maxPrice: 150000,
          unit: '원',
          minimumQuantity: 15,
          additionalInfo: '상의, 하의, 모자 세트 기준'
        }
      });
    });
    it('should handle missing customer gracefully', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(mockContext);
      expect(gatheredData).toMatchObject({
        requestedSport: '야구',
        requestedQuantity: 20,
        priceInfo: {
          sport: '야구',
          minPrice: 50000,
          maxPrice: 150000
        }
      });
      expect(gatheredData.teamName).toBeUndefined();
      expect(gatheredData.isExistingCustomer).toBeUndefined();
    });
    it('should use default sport when not specified', async () => {
      const contextWithoutSport = {
        ...mockContext,
        intent: {
          ...mockContext.intent,
          parameters: {}
        }
      };
      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      // @ts-expect-error - accessing protected method for testing
      const gatheredData = await processor.gatherContext(contextWithoutSport);
      expect(gatheredData.priceInfo).toMatchObject({
        sport: '야구', // Default
        minPrice: 50000,
        maxPrice: 150000
      });
    });
  });
  describe('buildPrompt', () => {
    it('should build prompt for existing customer with team info', () => {
      const gatheredData = {
        teamName: '서울 라이온즈',
        sportType: 'BASEBALL',
        isExistingCustomer: true,
        hasPreviousOrders: true,
        previousOrderCount: 3,
        priceInfo: {
          sport: '야구',
          minPrice: 50000,
          maxPrice: 150000,
          unit: '원',
          minimumQuantity: 15,
          additionalInfo: '상의, 하의, 모자 세트 기준'
        }
      };
      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);
      expect(prompt).toContain('서울 라이온즈');
      expect(prompt).toContain('기존 고객');
      expect(prompt).toContain('재주문 고객 (3회 주문)');
      expect(prompt).toContain('50,000원 ~ 150,000원');
      expect(prompt).toContain('최소 주문 수량: 15벌');
      expect(prompt).toContain('기존 고객에게는 특별 할인이 가능함을 언급');
    });
    it('should build prompt for new customer', () => {
      const gatheredData = {
        priceInfo: {
          sport: '축구',
          minPrice: 40000,
          maxPrice: 120000,
          unit: '원',
          minimumQuantity: 15
        }
      };
      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);
      expect(prompt).toContain('40,000원 ~ 120,000원');
      expect(prompt).not.toContain('기존 고객');
      expect(prompt).not.toContain('재주문');
    });
    it('should include minimum quantity warning', () => {
      const gatheredData = {
        requestedQuantity: 10,
        priceInfo: {
          sport: '농구',
          minPrice: 45000,
          maxPrice: 130000,
          unit: '원',
          minimumQuantity: 12
        }
      };
      // @ts-expect-error - accessing protected method for testing
      const prompt = processor.buildPrompt(mockContext, gatheredData);
      expect(prompt).toContain('최소 주문 수량 미달임을 안내하고 대안 제시');
    });
  });
  describe('postProcess', () => {
    it('should trim response', async () => {
      const response = '  처리된 응답입니다.  \n\n';
      // @ts-expect-error - accessing protected method for testing
      const processed = await processor.postProcess(response, mockContext, {});
      expect(processed).toBe('처리된 응답입니다.');
    });
    it('should collect metrics', async () => {
      const gatheredData = {
        sportType: 'BASEBALL',
        isExistingCustomer: true,
        hasPreviousOrders: false
      };
      // @ts-expect-error - accessing private method for testing
      const collectMetricsSpy = jest.spyOn(processor, 'collectMetrics');
      // @ts-expect-error - accessing protected method for testing
      await processor.postProcess('응답', mockContext, gatheredData);
      expect(collectMetricsSpy).toHaveBeenCalledWith(mockContext, gatheredData);
    });
  });
  describe('Integration test', () => {
    it('should process price inquiry end-to-end', async () => {
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer as Customer);

      // Mock LLM response
      const { __mockGenerateResponse } = require('../../llm');
      __mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '야구 유니폼은 50,000원부터 시작합니다. 기존 고객님께는 특별 할인이 가능합니다.'
      });

      const response = await processor.process(mockContext);
      expect(response.success).toBe(true);
      expect(response.message).toContain('야구 유니폼은 50,000원부터');
      expect(response.message).toContain('기존 고객님께는 특별 할인');
      expect(response.metadata?.source).toBe('llm');
    });
    it('should handle soccer price inquiry', async () => {
      const soccerContext = {
        ...mockContext,
        message: '축구 유니폼 20벌 가격 알려주세요',
        intent: {
          ...mockContext.intent,
          parameters: {
            sport: '축구',
            quantity: 20
          }
        }
      };
      const soccerCustomer = {
        ...mockCustomer,
        sportType: 'SOCCER',
        brand: 'MAX2MAX'
      };
      mockCustomerService.findByLineUserId.mockResolvedValue(soccerCustomer as Customer);
      const { __mockGenerateResponse } = require('../../llm');
      __mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '축구 유니폼은 40,000원부터 120,000원까지입니다.'
      });

      const response = await processor.process(soccerContext);
      expect(response.success).toBe(true);
      expect(response.message).toContain('축구 유니폼');
      expect(response.message).toContain('40,000원');
    });
  });
});