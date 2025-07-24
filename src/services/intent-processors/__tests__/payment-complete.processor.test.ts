import { PaymentCompleteProcessor } from '../payment-complete.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService, paymentService, deliveryService, customerJourneyService, intentService } from '../../database';
import { Customer, CustomerType, Brand, PaymentStatus, CustomerJourneyStage, OrderClassification, SportType, ChatStatus, FriendAddStatus, Payment, Delivery, CustomerJourney } from '../../../generated/prisma';
import { IntentResponseStrategy } from '../../database/intent.service';

// Type definitions for test data
interface MockDeliveryEstimate {
  isExpress: boolean;
  estimatedDate: Date;
}

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
    findByCustomerId: jest.fn(),
    updatePaymentStatus: jest.fn(),
    determineOrderClassification: jest.fn(),
    update: jest.fn()
  },
  deliveryService: {
    calculateEstimatedDeliveryDate: jest.fn(),
    upsertDelivery: jest.fn()
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
const mockDeliveryService = deliveryService as jest.Mocked<typeof deliveryService>;
const mockCustomerJourneyService = customerJourneyService as jest.Mocked<typeof customerJourneyService>;
const mockIntentService = intentService as jest.Mocked<typeof intentService>;
const mockGenerateResponse = require('../../llm').__mockGenerateResponse;

describe('PaymentCompleteProcessor', () => {
  let processor: PaymentCompleteProcessor;
  const mockCustomer: Customer = {
    id: 'customer-1',
    lineUserId: 'line-user-1',
    lineUserName: '山田太郎',
    customerType: CustomerType.EXISTING,
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

  const mockPayment: Partial<Payment> = {
    id: 'payment-1',
    customerId: 'customer-1',
    orderNumber: 'ORD-001',
    productDetails: {
      name: '野球ユニフォーム',
      category: 'BASEBALL_UNIFORM',
      quantity: 20
    },
    totalPurchaseCount: 1,
    totalPaymentAmount: 200000,
    actualPaymentAmount: 200000,
    payerEmail: 'yamada@example.com',
    payerPhone: '090-1234-5678',
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: null,
    paymentCompleteDate: null,
    firstOrderTime: null,
    secondOrderTime: null,
    thirdOrderTime: null,
    fourthOrderTime: null,
    fifthOrderTime: null,
    firstSecondInterval: null,
    secondThirdInterval: null,
    thirdFourthInterval: null,
    fourthFifthInterval: null,
    orderClassification: undefined,
    sampleRefundDeadline: null,
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

    processor = new PaymentCompleteProcessor();

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
    it('should process payment completion successfully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '決済が完了しました',
        intent: {
          intentName: 'payment.complete',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.findByCustomerId.mockResolvedValue([mockPayment as Payment]);

      const mockUpdatedPayment = {
        ...mockPayment,
        paymentStatus: PaymentStatus.COMPLETED
      };
      mockPaymentService.updatePaymentStatus.mockResolvedValue(mockUpdatedPayment as Payment);

      mockPaymentService.determineOrderClassification.mockResolvedValue(OrderClassification.NEW_BASEBALL);

      const mockPaymentWithClassification = {
        ...mockPayment,
        orderClassification: OrderClassification.NEW_BASEBALL
      };
      mockPaymentService.update.mockResolvedValue(mockPaymentWithClassification as Payment);

      const mockDeliveryEstimate: MockDeliveryEstimate = {
        isExpress: false,
        estimatedDate: new Date('2024-02-20')
      };
      mockDeliveryService.calculateEstimatedDeliveryDate.mockResolvedValue(mockDeliveryEstimate);

      const mockDelivery: Partial<Delivery> = {
        id: 'delivery-1',
        customerId: 'customer-1',
        orderNumber: 'ORD-001'
      };
      mockDeliveryService.upsertDelivery.mockResolvedValue(mockDelivery as Delivery);

      const mockJourney: Partial<CustomerJourney> = {
        id: 'journey-1',
        customerId: 'customer-1',
        journeyStage: CustomerJourneyStage.PAYMENT_COMPLETED
      };
      mockCustomerJourneyService.updateJourneyStage.mockResolvedValue(mockJourney as CustomerJourney);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '決済を確認しました。製作を開始いたします。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toContain('決済');
      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalledWith(
        'ORD-001',
        PaymentStatus.COMPLETED,
        expect.any(Date)
      );
      expect(mockDeliveryService.calculateEstimatedDeliveryDate).toHaveBeenCalledWith(
        'ORD-001',
        expect.any(Date),
        '野球ユニフォーム'
      );
      expect(mockCustomerJourneyService.updateJourneyStage).toHaveBeenCalledWith(
        'line-user-1',
        CustomerJourneyStage.PAYMENT_COMPLETED
      );
    });

    it('should handle EXPRESS delivery correctly', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '決済完了しました。EXPRESS配送でお願いします。',
        intent: {
          intentName: 'payment.complete',
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

      const mockUpdatedExpressPayment = {
        ...expressPayment,
        paymentStatus: PaymentStatus.COMPLETED
      };
      mockPaymentService.updatePaymentStatus.mockResolvedValue(mockUpdatedExpressPayment as Payment);

      mockPaymentService.determineOrderClassification.mockResolvedValue(OrderClassification.NEW_BASEBALL);

      const mockExpressPaymentWithClassification = {
        ...expressPayment,
        orderClassification: OrderClassification.NEW_BASEBALL
      };
      mockPaymentService.update.mockResolvedValue(mockExpressPaymentWithClassification as Payment);

      const mockExpressDeliveryEstimate: MockDeliveryEstimate = {
        isExpress: true,
        estimatedDate: new Date('2024-02-15')
      };
      mockDeliveryService.calculateEstimatedDeliveryDate.mockResolvedValue(mockExpressDeliveryEstimate);

      const mockExpressDelivery: Partial<Delivery> = {
        id: 'delivery-express-1',
        customerId: 'customer-1',
        orderNumber: 'ORD-001'
      };
      mockDeliveryService.upsertDelivery.mockResolvedValue(mockExpressDelivery as Delivery);

      const mockExpressJourney: Partial<CustomerJourney> = {
        id: 'journey-express-1',
        customerId: 'customer-1',
        journeyStage: CustomerJourneyStage.PAYMENT_COMPLETED
      };
      mockCustomerJourneyService.updateJourneyStage.mockResolvedValue(mockExpressJourney as CustomerJourney);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'EXPRESS配送で承りました。4週間でお届けします。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockDeliveryService.upsertDelivery).toHaveBeenCalledWith(
        'customer-1',
        'ORD-001',
        expect.objectContaining({
          isExpress: true
        })
      );
    });

    it('should handle missing payment record gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '決済しました',
        intent: {
          intentName: 'payment.complete',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockPaymentService.findByCustomerId.mockResolvedValue([]); // No pending payments
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '決済の確認をいたします。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockPaymentService.updatePaymentStatus).not.toHaveBeenCalled();
      expect(mockDeliveryService.calculateEstimatedDeliveryDate).not.toHaveBeenCalled();
    });

    it('should handle missing customer gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '決済完了',
        intent: {
          intentName: 'payment.complete',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '決済を承りました。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockPaymentService.findByCustomerId).not.toHaveBeenCalled();
    });

    it('should determine correct order classification', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '支払い完了しました',
        intent: {
          intentName: 'payment.complete',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue({
        ...mockCustomer,
        sportType: SportType.SOCCER
      });
      const soccerPayment: Partial<Payment> = {
        ...mockPayment,
        productDetails: {
          name: '野球ユニフォーム',
          category: 'SOCCER_UNIFORM'
        }
      };
      mockPaymentService.findByCustomerId.mockResolvedValue([soccerPayment as Payment]);

      const mockUpdatedSoccerPayment = {
        ...soccerPayment,
        paymentStatus: PaymentStatus.COMPLETED
      };
      mockPaymentService.updatePaymentStatus.mockResolvedValue(mockUpdatedSoccerPayment as Payment);

      mockPaymentService.determineOrderClassification.mockResolvedValue(OrderClassification.NEW_SOCCER);

      const mockSoccerPaymentWithClassification = {
        ...soccerPayment,
        orderClassification: OrderClassification.NEW_SOCCER
      };
      mockPaymentService.update.mockResolvedValue(mockSoccerPaymentWithClassification as Payment);

      const mockSoccerDeliveryEstimate: MockDeliveryEstimate = {
        isExpress: false,
        estimatedDate: new Date('2024-02-20')
      };
      mockDeliveryService.calculateEstimatedDeliveryDate.mockResolvedValue(mockSoccerDeliveryEstimate);

      const mockSoccerDelivery: Partial<Delivery> = {
        id: 'delivery-soccer-1',
        customerId: 'customer-1',
        orderNumber: 'ORD-001'
      };
      mockDeliveryService.upsertDelivery.mockResolvedValue(mockSoccerDelivery as Delivery);

      const mockSoccerJourney: Partial<CustomerJourney> = {
        id: 'journey-soccer-1',
        customerId: 'customer-1',
        journeyStage: CustomerJourneyStage.PAYMENT_COMPLETED
      };
      mockCustomerJourneyService.updateJourneyStage.mockResolvedValue(mockSoccerJourney as CustomerJourney);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '決済を確認しました。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockPaymentService.determineOrderClassification).toHaveBeenCalledWith(
        'SOCCER_UNIFORM',
        SportType.SOCCER
      );
      expect(mockPaymentService.update).toHaveBeenCalledWith(
        { id: 'payment-1' },
        { orderClassification: OrderClassification.NEW_SOCCER }
      );
    });
  });
});