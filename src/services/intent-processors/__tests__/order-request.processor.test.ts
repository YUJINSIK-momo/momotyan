import { OrderRequestProcessor } from '../order-request.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService, paymentService, customerJourneyService, intentService } from '../../database';
import { Customer, CustomerType, Brand, SportType, CustomerJourneyStage, ChatStatus, FriendAddStatus, Payment, CustomerJourney } from '../../../generated/prisma';
import { IntentResponseStrategy } from '../../database/intent.service';

// Type definitions for test data

// Mock dependencies
jest.mock('../../database/prisma');
jest.mock('../../database', () => ({
  customerService: {
    findByLineUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  paymentService: {
    getOrderStats: jest.fn(),
    findByCustomerId: jest.fn(),
    updatePaymentStatus: jest.fn(),
    determineOrderClassification: jest.fn(),
    update: jest.fn()
  },
  customerJourneyService: {
    updateJourneyStage: jest.fn()
  },
  intentService: {
    getResponseStrategy: jest.fn(),
    findByName: jest.fn()
  }
}));
jest.mock('../../conversation-context', () => ({
  conversationContextService: {
    getRecentMessages: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn().mockResolvedValue(undefined)
  }
}));
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

// Get mocked functions
const mockCustomerService = customerService as jest.Mocked<typeof customerService>;
const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;
const mockCustomerJourneyService = customerJourneyService as jest.Mocked<typeof customerJourneyService>;
const mockIntentService = intentService as jest.Mocked<typeof intentService>;
const mockGenerateResponse = require('../../llm').__mockGenerateResponse;

describe('OrderRequestProcessor', () => {
  let processor: OrderRequestProcessor;
  const mockCustomer: Customer = {
    id: 'customer-1',
    lineUserId: 'line-user-1',
    lineUserName: '山田太郎',
    customerType: CustomerType.NEW,
    teamName: '東京ライオンズ',
    sportType: SportType.BASEBALL,
    brand: Brand.ILB_MAX,
    agentAssigned: null,
    notes: null,
    chatStatus: ChatStatus.CHATTING,
    friendAddDate: new Date(),
    firstChatDate: new Date(),
    friendAddStatus: FriendAddStatus.FRIEND,
    lastMessageDate: new Date(),
    blockDate: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set default mock response for LLM
    mockGenerateResponse.mockResolvedValue({
      success: true,
      content: 'Default test response'
    });

    processor = new OrderRequestProcessor();

    // Mock intent service response strategy
    const mockResponseStrategy: IntentResponseStrategy = {
      strategy: 'DYNAMIC',
      cacheEnabled: false,
      contextRequired: ['teamName', 'conversationHistory']
    };
    mockIntentService.getResponseStrategy.mockResolvedValue(mockResponseStrategy);

    // Mock intent service findByName
    mockIntentService.findByName.mockResolvedValue(null);
  });

  describe('process', () => {
    it('should process order request for new customer', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'ユニフォームを注文したいです',
        intent: {
          intentName: 'order.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.getOrderStats.mockResolvedValue({
        totalOrders: 0,
        completedOrders: 0,
        totalAmount: 0,
        averageOrderValue: 0
      });
      mockPaymentService.findByCustomerId.mockResolvedValue([]);
      const mockJourney: Partial<CustomerJourney> = {
        id: 'journey-1',
        customerId: 'customer-1',
        journeyStage: CustomerJourneyStage.ORDERSHEET_REQUESTED
      };
      mockCustomerJourneyService.updateJourneyStage.mockResolvedValue(mockJourney as CustomerJourney);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'ユニフォームのご注文ありがとうございます。チーム名をお聞かせください。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toContain('注文');
      expect(mockCustomerService.findByLineUserId).toHaveBeenCalledWith('line-user-1');
      expect(mockPaymentService.getOrderStats).toHaveBeenCalledWith('customer-1');
      expect(mockCustomerJourneyService.updateJourneyStage).toHaveBeenCalledWith(
        'line-user-1',
        CustomerJourneyStage.ORDERSHEET_REQUESTED
      );
    });

    it('should process order request for existing customer with previous orders', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '追加注文をお願いします',
        intent: {
          intentName: 'order.additional',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue({
        ...mockCustomer,
        customerType: CustomerType.EXISTING
      });
      mockPaymentService.getOrderStats.mockResolvedValue({
        totalOrders: 3,
        completedOrders: 3,
        totalAmount: 450000,
        averageOrderValue: 150000
      });
      const mockPayment: Partial<Payment> = {
        id: 'payment-1',
        orderNumber: 'ORD-001',
        customerId: 'customer-1'
      };
      mockPaymentService.findByCustomerId.mockResolvedValue([mockPayment as Payment]);
      const mockJourney: Partial<CustomerJourney> = {
        id: 'journey-1',
        customerId: 'customer-1',
        journeyStage: CustomerJourneyStage.ORDERSHEET_REQUESTED
      };
      mockCustomerJourneyService.updateJourneyStage.mockResolvedValue(mockJourney as CustomerJourney);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '追加注文を承ります。前回と同じデザインでよろしいでしょうか？'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toContain('追加');
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('기존 고객 (총 3건 주문)'),
        expect.any(Object)
      );
    });

    it('should include team name and sport type in prompt', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '野球のユニフォームを注文したい',
        intent: {
          intentName: 'order.new',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue({
        ...mockCustomer,
        teamName: '東京ライオンズ',
        sportType: SportType.BASEBALL
      });
      mockPaymentService.getOrderStats.mockResolvedValue({
        totalOrders: 0,
        completedOrders: 0,
        totalAmount: 0,
        averageOrderValue: 0
      });
      mockPaymentService.findByCustomerId.mockResolvedValue([]);
      const mockJourney: Partial<CustomerJourney> = {
        id: 'journey-1',
        customerId: 'customer-1',
        journeyStage: CustomerJourneyStage.ORDERSHEET_REQUESTED
      };
      mockCustomerJourneyService.updateJourneyStage.mockResolvedValue(mockJourney as CustomerJourney);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '東京ライオンズ様の野球ユニフォームですね。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('東京ライオンズ'),
        expect.any(Object)
      );
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('BASEBALL'),
        expect.any(Object)
      );
    });

    it('should handle missing customer gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '注文したいです',
        intent: {
          intentName: 'order.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'ご注文を承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockPaymentService.getOrderStats).not.toHaveBeenCalled();
      expect(mockCustomerJourneyService.updateJourneyStage).toHaveBeenCalled();
    });

    it('should handle customer journey update failure gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '注文します',
        intent: {
          intentName: 'order.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.getOrderStats.mockResolvedValue({
        totalOrders: 0,
        completedOrders: 0,
        totalAmount: 0,
        averageOrderValue: 0
      });
      mockPaymentService.findByCustomerId.mockResolvedValue([]);
      mockCustomerJourneyService.updateJourneyStage.mockRejectedValue(new Error('DB Error'));
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'ご注文を承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toBe('ご注文を承ります。');
      // Should not throw error even if journey update fails
    });
  });
});