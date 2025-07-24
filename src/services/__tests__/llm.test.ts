import axios from 'axios';
import { LLMService, PromptTemplate } from '../llm';
import { conversationContextService } from '../conversation-context';
import logger from '../../utils/logger';

// 의존성 모킹
jest.mock('axios');
jest.mock('../conversation-context');
jest.mock('../../utils/logger');
jest.mock('../../config', () => ({
  config: {
    llm: {
      apiUrl: 'https://api.test.com/v1/chat/completions',
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1000
    }
  }
}));

// 모킹 구성을 위한 헬퍼 타입
interface MockAxiosConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  data?: unknown;
}

describe('LLMService', () => {
  let llmService: LLMService;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    llmService = new LLMService();
  });

  describe('generateResponse', () => {
    it('should generate response successfully', async () => {
      const prompt = '유니폼 가격을 알려주세요';
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: '유니폼 가격은 디자인과 수량에 따라 다르지만, 기본적으로 1벌당 5,000엔부터 시작합니다.'
            }
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150
          }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateResponse(prompt);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.objectContaining({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: expect.stringContaining('Kalron') },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          stream: false
        }),
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      expect(result).toEqual({
        success: true,
        content: '유니폼 가격은 디자인과 수량에 따라 다르지만, 기본적으로 1벌당 5,000엔부터 시작합니다.',
        answer: '유니폼 가격은 디자인과 수량에 따라 다르지만, 기본적으로 1벌당 5,000엔부터 시작합니다.',
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150
        }
      });

      expect(logger.info).toHaveBeenCalledWith('Sending request to LLM API', {
        model: 'gpt-4o-mini',
        promptLength: prompt.length
      });

      expect(logger.info).toHaveBeenCalledWith('LLM response generated successfully', {
        contentLength: mockResponse.data.choices[0].message.content.length,
        usage: mockResponse.data.usage
      });
    });

    it('should handle custom generation options', async () => {
      const prompt = 'Test prompt';
      const options = {
        temperature: 0.5,
        maxTokens: 500,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2
      };

      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Test response' }
          }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await llmService.generateResponse(prompt, options);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 500,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.2
        }),
        expect.any(Object)
      );
    });

    it('should handle empty content response', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        data: {
          choices: [{
            message: {}
          }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateResponse(prompt);

      expect(result).toEqual({
        success: false,
        error: 'No content received from LLM'
      });
    });

    it('should handle API errors', async () => {
      const prompt = 'Test prompt';
      const error = new Error('API request failed');

      mockedAxios.post.mockRejectedValue(error);

      const result = await llmService.generateResponse(prompt);

      expect(result).toEqual({
        success: false,
        error: 'API request failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Error generating LLM response', {
        error,
        prompt
      });
    });

    it('should handle missing usage data', async () => {
      const prompt = 'Test prompt';
      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Test response' }
          }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateResponse(prompt);

      expect(result.usage).toBeUndefined();
      expect(result.success).toBe(true);
    });
  });

  describe('generateWithContext', () => {
    it('should generate response with conversation context', async () => {
      const conversationId = 'conv123';
      const userId = 'user123';
      const userMessage = '지난 주문에 대해 알려주세요';

      const mockRecentMessages = [
        { role: 'user', content: '유니폼을 주문하고 싶어요' },
        { role: 'assistant', content: '팀명을 알려주세요' },
        { role: 'user', content: '도쿄 라이온즈입니다' },
        { role: 'assistant', content: '도쿄 라이온즈님이시군요. 몇 벌 필요하세요?' }
      ];

      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: '지난번에는 도쿄 라이온즈님의 유니폼에 대해 언급했었습니다. 수량을 여쭤보던 단계였는데, 어떠신가요?'
            }
          }],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 50,
            total_tokens: 250
          }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      (conversationContextService.getRecentMessages as jest.Mock).mockResolvedValue(mockRecentMessages);
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateWithContext(conversationId, userId, userMessage);

      expect(conversationContextService.getRecentMessages).toHaveBeenCalledWith(conversationId, 10);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            ...mockRecentMessages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            { role: 'user', content: userMessage }
          ])
        }),
        expect.any(Object)
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('도쿄 라이온즈님');
    });

    it('should apply prompt template', async () => {
      const conversationId = 'conv123';
      const userId = 'user123';
      const userMessage = '테스트';

      const promptTemplate: PromptTemplate = {
        system: 'You are a helpful assistant specialized in uniforms.',
        userPrefix: 'Customer inquiry: ',
        userSuffix: '\nPlease provide a detailed response.',
        examples: [
          { user: '가격?', assistant: '가격은 5000엔부터 시작합니다.' }
        ]
      };

      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Test response with template' }
          }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      (conversationContextService.getRecentMessages as jest.Mock).mockResolvedValue([]);
      mockedAxios.post.mockResolvedValue(mockResponse);

      await llmService.generateWithContext(conversationId, userId, userMessage, promptTemplate);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: 'You are a helpful assistant specialized in uniforms.' },
            { role: 'user', content: '가격?' },
            { role: 'assistant', content: '가격은 5000엔부터 시작합니다.' },
            { role: 'user', content: 'Customer inquiry: 테스트\nPlease provide a detailed response.' }
          ])
        }),
        expect.any(Object)
      );
    });

    it('should handle errors in context generation', async () => {
      const conversationId = 'conv123';
      const userId = 'user123';
      const userMessage = 'Test';
      const error = new Error('Context error');

      (conversationContextService.getRecentMessages as jest.Mock).mockRejectedValue(error);

      const result = await llmService.generateWithContext(conversationId, userId, userMessage);

      expect(result).toEqual({
        success: false,
        error: 'Context error'
      });

      expect(logger.error).toHaveBeenCalledWith('Error generating response with context', {
        error,
        conversationId,
        userId
      });
    });

    it('should save conversation to context after successful generation', async () => {
      const conversationId = 'conv123';
      const userId = 'user123';
      const userMessage = 'Test message';

      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Test response' }
          }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      (conversationContextService.getRecentMessages as jest.Mock).mockResolvedValue([]);
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateWithContext(conversationId, userId, userMessage);

      expect(conversationContextService.addMessage).toHaveBeenCalledTimes(2);
      expect(conversationContextService.addMessage).toHaveBeenCalledWith(
        conversationId,
        { role: 'user', content: userMessage }
      );
      expect(conversationContextService.addMessage).toHaveBeenCalledWith(
        conversationId,
        { role: 'assistant', content: 'Test response' }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('buildMessagesWithContext (through generateWithContext)', () => {
    it('should build messages array correctly', async () => {
      const conversationId = 'conv123';
      const userId = 'user123';
      const userMessage = 'New question';
      const recentMessages = [
        { role: 'user', content: 'Old question' },
        { role: 'assistant', content: 'Old answer' }
      ];

      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Response' } }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      (conversationContextService.getRecentMessages as jest.Mock).mockResolvedValue(recentMessages);
      mockedAxios.post.mockResolvedValue(mockResponse);

      await llmService.generateWithContext(conversationId, userId, userMessage);

      // axios 호출을 통해 메시지 배열 구조 확인
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: [
            expect.objectContaining({ role: 'system' }),
            { role: 'user', content: 'Old question' },
            { role: 'assistant', content: 'Old answer' },
            { role: 'user', content: userMessage }
          ]
        }),
        expect.any(Object)
      );
    });

    it('should apply prompt template correctly', async () => {
      const conversationId = 'conv123';
      const userId = 'user123';
      const userMessage = 'Question';
      const template: PromptTemplate = {
        system: 'Custom system prompt',
        userPrefix: 'Q: ',
        userSuffix: ' Answer briefly.',
        examples: [
          { user: 'Example Q', assistant: 'Example A' }
        ]
      };

      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Response' } }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://api.test.com/v1/chat/completions' } as MockAxiosConfig
      };

      (conversationContextService.getRecentMessages as jest.Mock).mockResolvedValue([]);
      mockedAxios.post.mockResolvedValue(mockResponse);

      await llmService.generateWithContext(conversationId, userId, userMessage, template);

      // axios 호출을 통해 메시지 배열 구조 확인
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'Custom system prompt' },
            { role: 'user', content: 'Example Q' },
            { role: 'assistant', content: 'Example A' },
            { role: 'user', content: 'Q: Question Answer briefly.' }
          ]
        }),
        expect.any(Object)
      );
    });
  });
});