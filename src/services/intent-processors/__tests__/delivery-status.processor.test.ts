import { DeliveryStatusProcessor } from '../delivery-status.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService, deliveryService, paymentService, intentService } from '../../database';
import { Customer, CustomerType, Brand, PaymentStatus, ChatStatus, FriendAddStatus, Payment, Delivery } from '../../../generated/prisma';
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
  deliveryService: {
    findByOrderNumber: jest.fn(),
    checkDeliveryDelay: jest.fn()
  },
  paymentService: {
    findByCustomerId: jest.fn()
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
const mockDeliveryService = deliveryService as jest.Mocked<typeof deliveryService>;
const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;
const mockIntentService = intentService as jest.Mocked<typeof intentService>;
const mockGenerateResponse = require('../../llm').__mockGenerateResponse;

describe('DeliveryStatusProcessor', () => {
  let processor: DeliveryStatusProcessor;
  const mockCustomer: Customer = {
    id: 'customer-1',
    lineUserId: 'line-user-1',
    lineUserName: '山田太郎',
    customerType: CustomerType.EXISTING,
    teamName: '東京ライオンズ',
    sportType: null,
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

  const mockPayment: Partial<Payment> = {
    id: 'payment-1',
    customerId: 'customer-1',
    orderNumber: 'ORD-001',
    productDetails: {
      name: '野球ユニフォーム',
      category: 'BASEBALL_UNIFORM'
    },
    paymentStatus: PaymentStatus.COMPLETED
  };

  const mockDelivery: Partial<Delivery> = {
    id: 'delivery-1',
    customerId: 'customer-1',
    orderNumber: 'ORD-001',
    isExpress: false,
    estimatedDeliveryDate: new Date('2024-02-20'),
    actualDeliveryDate: null,
    trackingNumber: 'TRACK123456'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set default mock response for LLM
    mockGenerateResponse.mockResolvedValue({
      success: true,
      content: 'Default test response'
    });

    processor = new DeliveryStatusProcessor();

    // Mock intent service response strategy
    const mockResponseStrategy: IntentResponseStrategy = {
      strategy: 'DYNAMIC',
      cacheEnabled: false,
      contextRequired: ['orderNumber', 'deliveryStatus']
    };
    mockIntentService.getResponseStrategy.mockResolvedValue(mockResponseStrategy);

    // Mock intent service findByName
    mockIntentService.findByName.mockResolvedValue(null);
  });

  describe('process', () => {
    it('should process delivery status inquiry with active delivery', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '配送状況を教えてください',
        intent: {
          intentName: 'delivery.status',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.findByCustomerId.mockResolvedValue([mockPayment as Payment]);
      mockDeliveryService.findByOrderNumber.mockResolvedValue(mockDelivery as Delivery);
      mockDeliveryService.checkDeliveryDelay.mockResolvedValue({
        isDelayed: false,
        delayDays: 0
      });
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'お客様の注文（ORD-001）は現在製作中です。予定通り2024年2月20日にお届け予定です。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toContain('ORD-001');
      expect(mockDeliveryService.findByOrderNumber).toHaveBeenCalledWith('ORD-001');
      expect(mockDeliveryService.checkDeliveryDelay).toHaveBeenCalledWith('ORD-001');
    });

    it('should handle delayed delivery', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '配送はいつ頃になりますか？',
        intent: {
          intentName: 'delivery.tracking',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.findByCustomerId.mockResolvedValue([mockPayment as Payment]);
      mockDeliveryService.findByOrderNumber.mockResolvedValue(mockDelivery as Delivery);
      mockDeliveryService.checkDeliveryDelay.mockResolvedValue({
        isDelayed: true,
        delayDays: 5
      });
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '申し訳ございません。5日ほど遅れており、2月25日のお届け予定となります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ 지연: 5일'),
        expect.any(Object)
      );
    });

    it('should handle EXPRESS delivery status', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'EXPRESS配送の状況は？',
        intent: {
          intentName: 'delivery.status',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      const expressPayment: Partial<Payment> = {
        ...mockPayment,
        productDetails: {
          name: 'EXPRESS野球ユニフォーム',
          category: 'EXPRESS_UNIFORM'
        }
      };
      mockPaymentService.findByCustomerId.mockResolvedValue([expressPayment as Payment]);

      const expressDelivery: Partial<Delivery> = {
        ...mockDelivery,
        isExpress: true,
        estimatedDeliveryDate: new Date('2024-02-15')
      };
      mockDeliveryService.findByOrderNumber.mockResolvedValue(expressDelivery as Delivery);
      mockDeliveryService.checkDeliveryDelay.mockResolvedValue({
        isDelayed: false,
        delayDays: 0
      });
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'EXPRESS配送で2月15日お届け予定です。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('EXPRESS (4주)'),
        expect.any(Object)
      );
    });

    it('should handle no active deliveries', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '配送状況を確認したい',
        intent: {
          intentName: 'delivery.status',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.findByCustomerId.mockResolvedValue([]); // No completed payments
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '現在、配送中の注文はございません。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('현재 진행 중인 배송이 없습니다'),
        expect.any(Object)
      );
    });

    it('should include tracking number if available', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '追跡番号を教えて',
        intent: {
          intentName: 'delivery.tracking',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.findByCustomerId.mockResolvedValue([mockPayment as Payment]);

      const deliveryWithTracking: Partial<Delivery> = {
        ...mockDelivery,
        trackingNumber: 'JP123456789'
      };
      mockDeliveryService.findByOrderNumber.mockResolvedValue(deliveryWithTracking as Delivery);
      mockDeliveryService.checkDeliveryDelay.mockResolvedValue({
        isDelayed: false,
        delayDays: 0
      });
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '追跡番号はJP123456789です。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('운송장 번호: JP123456789'),
        expect.any(Object)
      );
    });

    it('should handle missing customer gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '配送状況',
        intent: {
          intentName: 'delivery.status',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '配送状況を確認いたします。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockPaymentService.findByCustomerId).not.toHaveBeenCalled();
      expect(mockDeliveryService.findByOrderNumber).not.toHaveBeenCalled();
    });
  });
});