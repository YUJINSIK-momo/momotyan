import { DesignRequestProcessor } from '../design-request.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService, designService, intentService } from '../../database';
import { Customer, CustomerType, Brand, SportType, ChatStatus, FriendAddStatus, Design } from '../../../generated/prisma';
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
  designService: {
    findLatestByCustomerId: jest.fn(),
    getRevisionStats: jest.fn(),
    create: jest.fn(),
    incrementRevisionByMessage: jest.fn()
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
const mockDesignService = designService as jest.Mocked<typeof designService>;
const mockIntentService = intentService as jest.Mocked<typeof intentService>;
const mockGenerateResponse = require('../../llm').__mockGenerateResponse;

describe('DesignRequestProcessor', () => {
  let processor: DesignRequestProcessor;
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

  const mockDesign: Partial<Design> = {
    id: 'design-1',
    customerId: 'customer-1',
    designRequestId: null,
    revision1Count: 0,
    revision2Count: 0,
    revision3Count: 0,
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

    processor = new DesignRequestProcessor();

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
    it('should process design request for new customer', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'ユニフォームのデザインを作りたいです',
        intent: {
          intentName: 'design.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      // Mock for gatherContext
      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockDesignService.findLatestByCustomerId.mockResolvedValue(null);
      mockDesignService.getRevisionStats.mockResolvedValue({
        totalRevisions: 0,
        revision1: 0,
        revision2: 0,
        revision3: 0
      });
      // Mock for postProcess - design creation
      mockDesignService.create.mockResolvedValue(mockDesign as Design);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'かしこまりました。ユニフォームのデザインを承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toBe('かしこまりました。ユニフォームのデザインを承ります。');
      expect(mockCustomerService.findByLineUserId).toHaveBeenCalledWith('line-user-1');
      expect(mockDesignService.findLatestByCustomerId).toHaveBeenCalledWith('customer-1');
      expect(mockGenerateResponse).toHaveBeenCalled();
    });

    it('should process design request for customer with existing design', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'デザインを修正したいです',
        intent: {
          intentName: 'design.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockDesignService.findLatestByCustomerId.mockResolvedValue(mockDesign as Design);
      mockDesignService.getRevisionStats.mockResolvedValue({
        totalRevisions: 3,
        revision1: 2,
        revision2: 1,
        revision3: 0
      });
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'デザインの修正を承ります。現在3回の修正履歴があります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toContain('修正');
      expect(mockDesignService.getRevisionStats).toHaveBeenCalledWith('customer-1');
    });

    it('should create new design record for first-time design request', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '新しくデザインを作りたいです',
        intent: {
          intentName: 'design.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockDesignService.findLatestByCustomerId.mockResolvedValue(null);
      mockDesignService.getRevisionStats.mockResolvedValue({
        totalRevisions: 0,
        revision1: 0,
        revision2: 0,
        revision3: 0
      });
      mockDesignService.create.mockResolvedValue(mockDesign as Design);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '新しいデザインのご依頼ですね。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockDesignService.create).toHaveBeenCalledWith({
        customer: { connect: { id: 'customer-1' } }
      });
    });

    it('should handle missing customer gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'デザインを作りたいです',
        intent: {
          intentName: 'design.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'デザインのご依頼を承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockDesignService.findLatestByCustomerId).not.toHaveBeenCalled();
      expect(mockDesignService.create).not.toHaveBeenCalled();
    });

    it('should include sport type in prompt when available', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '野球のユニフォームデザインを頼みたい',
        intent: {
          intentName: 'design.request',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue({
        ...mockCustomer,
        sportType: SportType.BASEBALL
      });
      mockDesignService.findLatestByCustomerId.mockResolvedValue(null);
      mockDesignService.getRevisionStats.mockResolvedValue({
        totalRevisions: 0,
        revision1: 0,
        revision2: 0,
        revision3: 0
      });
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '野球のユニフォームデザインを承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('BASEBALL'),
        expect.any(Object)
      );
    });
  });
});