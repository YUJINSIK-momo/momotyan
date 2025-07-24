import { DesignModificationProcessor } from '../design-modification.processor';
import { ProcessorContext } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { customerService, designService, intentService } from '../../database';
import { Customer, CustomerType, Brand, ChatStatus, FriendAddStatus, Design } from '../../../generated/prisma';
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

describe('DesignModificationProcessor', () => {
  let processor: DesignModificationProcessor;
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

  const mockDesign: Partial<Design> = {
    id: 'design-1',
    customerId: 'customer-1',
    designRequestId: null,
    revision1Count: 2,
    revision2Count: 1,
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

    processor = new DesignModificationProcessor();

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
    it('should process design modification request', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '背番号のフォントを変更してください',
        intent: {
          intentName: 'design.modification',
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
      mockDesignService.incrementRevisionByMessage.mockResolvedValue(mockDesign as Design);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '背番号のフォント変更を承りました。デザイナーに伝えます。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(response.message).toContain('背番号');
      expect(mockDesignService.incrementRevisionByMessage).toHaveBeenCalledWith(
        'customer-1',
        '背番号のフォントを変更してください'
      );
    });

    it('should auto-detect revision number from message', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: '2次修正シアンをお願いします',
        intent: {
          intentName: 'design.modification',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockDesignService.findLatestByCustomerId.mockResolvedValue(mockDesign as Design);
      mockDesignService.getRevisionStats.mockResolvedValue({
        totalRevisions: 4,
        revision1: 2,
        revision2: 2,
        revision3: 0
      });
      mockDesignService.incrementRevisionByMessage.mockResolvedValue(mockDesign as Design);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: '2次修正を承りました。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockDesignService.incrementRevisionByMessage).toHaveBeenCalledWith(
        'customer-1',
        '2次修正シアンをお願いします'
      );
    });

    it('should handle customer without existing design', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'デザインを修正してください',
        intent: {
          intentName: 'design.modification',
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
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'デザインの修正を承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockDesignService.incrementRevisionByMessage).toHaveBeenCalledWith(
        'customer-1',
        'デザインを修正してください'
      );
    });

    it('should include revision statistics in prompt', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'ロゴの位置を調整してください',
        intent: {
          intentName: 'design.modification',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(mockCustomer);
      mockDesignService.findLatestByCustomerId.mockResolvedValue(mockDesign as Design);
      mockDesignService.getRevisionStats.mockResolvedValue({
        totalRevisions: 5,
        revision1: 2,
        revision2: 2,
        revision3: 1
      });
      mockDesignService.incrementRevisionByMessage.mockResolvedValue(mockDesign as Design);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'ロゴの位置調整を承りました。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      // Check that prompt includes revision counts
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('1차 수정: 2회'),
        expect.any(Object)
      );
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('2차 수정: 2회'),
        expect.any(Object)
      );
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.stringContaining('3차 수정: 1회'),
        expect.any(Object)
      );
    });

    it('should handle missing customer gracefully', async () => {
      const context: ProcessorContext = {
        userId: 'line-user-1',
        message: 'デザインを修正してください',
        intent: {
          intentName: 'design.modification',
          confidence: 0.9,
          parameters: {}
        } as IntentDetectionResult,
        conversationId: 'conv-1'
      };

      mockCustomerService.findByLineUserId.mockResolvedValue(null);
      mockGenerateResponse.mockResolvedValue({
        success: true,
        content: 'デザインの修正を承ります。'
      });

      const response = await processor.process(context);

      expect(response.success).toBe(true);
      expect(mockDesignService.findLatestByCustomerId).not.toHaveBeenCalled();
      expect(mockDesignService.incrementRevisionByMessage).not.toHaveBeenCalled();
    });
  });
});