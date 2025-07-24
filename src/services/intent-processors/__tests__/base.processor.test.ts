import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from '../base.processor';
import { IntentDetectionResult } from '../../dialogflow';
import { LLMService } from '../../llm';
import { intentService } from '../../database/intent.service';
import { conversationContextService } from '../../conversation-context';

// Mock dependencies
jest.mock('../../llm');
jest.mock('../../database/intent.service');
jest.mock('../../conversation-context');
jest.mock('../../../utils/logger');

// Concrete implementation for testing
class TestProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    return this.baseProcess(context);
  }

  protected async gatherContext(_context: ProcessorContext): Promise<Record<string, unknown>> {
    return {
      testData: 'test value',
      customerName: '테스트 고객'
    };
  }

  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    return `Test prompt for ${context.message} with ${JSON.stringify(gatheredData)}`;
  }

  protected async postProcess(response: string, _context: ProcessorContext, _gatheredData: Record<string, unknown>): Promise<string> {
    return `[POST] ${response}`;
  }
}

describe('BaseIntentProcessor', () => {
  let processor: TestProcessor;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockIntentService: jest.Mocked<typeof intentService>;
  let mockConversationContextService: jest.Mocked<typeof conversationContextService>;

  const mockContext: ProcessorContext = {
    userId: 'test-user-123',
    message: '가격이 어떻게 되나요?',
    intent: {
      intentName: 'price.inquiry',
      confidence: 0.95,
      parameters: {},
      queryText: '가격이 어떻게 되나요?',
      allRequiredParamsPresent: true
    } as IntentDetectionResult,
    conversationId: 'conv-123',
    metadata: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new TestProcessor();

    mockLLMService = (LLMService as jest.MockedClass<typeof LLMService>).mock.instances[0] as jest.Mocked<LLMService>;
    mockIntentService = intentService as jest.Mocked<typeof intentService>;
    mockConversationContextService = conversationContextService as jest.Mocked<typeof conversationContextService>;
  });

  describe('STATIC strategy', () => {
    it('should return static response when strategy is STATIC', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'STATIC',
        cacheEnabled: true,
        contextRequired: []
      });

      mockIntentService.findByName.mockResolvedValue({
        id: '1',
        name: 'price.inquiry',
        category: 'GENERAL_INQUIRY',
        responseTemplate: '안녕하세요. 가격은 50,000원부터 시작합니다.',
        automationRate: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await processor.process(mockContext);

      expect(response).toEqual({
        success: true,
        message: '안녕하세요. 가격은 50,000원부터 시작합니다.',
        metadata: {
          source: 'static',
          processingTime: expect.any(Number)
        }
      });

      expect(mockLLMService.generateResponse).not.toHaveBeenCalled();
    });

    it('should return fallback message when static response not found', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'STATIC',
        cacheEnabled: true,
        contextRequired: []
      });

      mockIntentService.findByName.mockResolvedValue(null);

      const response = await processor.process(mockContext);

      expect(response.success).toBe(true);
      expect(response.message).toContain('申し訳ございません');
      expect(response.metadata?.source).toBe('static');
    });
  });

  describe('TEMPLATE strategy', () => {
    it('should process template with gathered context', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'TEMPLATE',
        cacheEnabled: true,
        contextRequired: ['customerName', 'testData']
      });

      mockIntentService.findByName.mockResolvedValue({
        id: '1',
        name: 'price.inquiry',
        category: 'GENERAL_INQUIRY',
        responseTemplate: '{{customerName}}님, 테스트 데이터: {{testData}}',
        automationRate: 90,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await processor.process(mockContext);

      expect(response).toEqual({
        success: true,
        message: '[POST] 테스트 고객님, 테스트 데이터: test value',
        metadata: {
          source: 'template',
          processingTime: expect.any(Number)
        }
      });
    });

    it('should fallback to dynamic when template not found', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'TEMPLATE',
        cacheEnabled: false,
        contextRequired: []
      });

      mockIntentService.findByName.mockResolvedValue({
        id: '1',
        name: 'price.inquiry',
        category: 'GENERAL_INQUIRY',
        responseTemplate: null,
        automationRate: 90,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      mockLLMService.generateResponse.mockResolvedValue({
        success: true,
        content: 'LLM 생성 응답'
      });

      const response = await processor.process(mockContext);

      expect(response.message).toBe('[POST] LLM 생성 응답');
      // When template is null, it falls back to dynamic but source remains 'template'
      expect(response.metadata?.source).toBe('template');
      expect(mockLLMService.generateResponse).toHaveBeenCalled();
    });
  });

  describe('DYNAMIC strategy', () => {
    it('should generate response using LLM', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'DYNAMIC',
        cacheEnabled: false,
        contextRequired: []
      });

      mockLLMService.generateResponse.mockResolvedValue({
        success: true,
        content: '동적으로 생성된 응답입니다.'
      });

      mockConversationContextService.getRecentMessages.mockResolvedValue([]);

      const response = await processor.process(mockContext);

      expect(response).toEqual({
        success: true,
        message: '[POST] 동적으로 생성된 응답입니다.',
        metadata: {
          source: 'llm',
          processingTime: expect.any(Number)
        }
      });

      expect(mockLLMService.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Test prompt for'),
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 500
        })
      );
    });

    it('should return fallback when LLM fails', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'DYNAMIC',
        cacheEnabled: false,
        contextRequired: []
      });

      mockLLMService.generateResponse.mockResolvedValue({
        success: false,
        content: undefined,
        error: 'LLM service error'
      });

      const response = await processor.process(mockContext);

      expect(response.success).toBe(true);
      expect(response.message).toContain('申し訳ございません');
      expect(response.metadata?.source).toBe('llm');
    });
  });

  describe('HYBRID strategy', () => {
    it('should behave like DYNAMIC strategy', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'HYBRID',
        cacheEnabled: true,
        contextRequired: []
      });

      mockLLMService.generateResponse.mockResolvedValue({
        success: true,
        content: '하이브리드 응답'
      });

      const response = await processor.process(mockContext);

      expect(response.message).toBe('[POST] 하이브리드 응답');
      expect(response.metadata?.source).toBe('llm');
    });
  });

  describe('Conversation context update', () => {
    it('should update conversation context on success', async () => {
      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'STATIC',
        cacheEnabled: true,
        contextRequired: []
      });

      mockIntentService.findByName.mockResolvedValue({
        id: '1',
        name: 'price.inquiry',
        category: 'GENERAL_INQUIRY',
        responseTemplate: '정적 응답',
        automationRate: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await processor.process(mockContext);

      expect(mockConversationContextService.addMessage).toHaveBeenCalledWith(
        'conv-123',
        'test-user-123',
        'assistant',
        '정적 응답',
        {
          intent: 'price.inquiry',
          confidence: 0.95,
          strategy: 'STATIC'
        }
      );
    });

    it('should not update context when conversationId is missing', async () => {
      const contextWithoutConvId = { ...mockContext, conversationId: undefined };

      mockIntentService.getResponseStrategy.mockResolvedValue({
        strategy: 'STATIC',
        cacheEnabled: true,
        contextRequired: []
      });

      mockIntentService.findByName.mockResolvedValue({
        id: '1',
        name: 'price.inquiry',
        category: 'GENERAL_INQUIRY',
        responseTemplate: '정적 응답',
        automationRate: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await processor.process(contextWithoutConvId);

      expect(mockConversationContextService.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should return fallback message on exception', async () => {
      mockIntentService.getResponseStrategy.mockRejectedValue(new Error('DB Error'));

      const response = await processor.process(mockContext);

      expect(response).toEqual({
        success: false,
        message: expect.stringContaining('申し訳ございません'),
        metadata: {
          source: 'static',
          processingTime: expect.any(Number)
        }
      });
    });
  });
});