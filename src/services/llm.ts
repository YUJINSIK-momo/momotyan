import axios from 'axios';
import { config } from '../config';
import { conversationContextService } from './conversation-context';
import { ConversationMessage } from './database/conversation.service';
import logger from '../utils/logger';

// LLM 응답 타입 정의
export interface LLMResponse {
  success: boolean;
  content?: string;
  answer?: string; // 이전 버전과의 호환성을 위해 유지
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// LLM 생성 옵션
export interface LLMGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

// 프롬프트 템플릿 타입
export interface PromptTemplate {
  system?: string;
  userPrefix?: string;
  userSuffix?: string;
  examples?: Array<{
    user: string;
    assistant: string;
  }>;
}

// LLM 서비스 클래스
export class LLMService {
  private defaultSystemPrompt: string;
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiUrl = config.llm.apiUrl;
    this.apiKey = config.llm.apiKey;
    this.model = config.llm.model;
    this.defaultSystemPrompt = `당신은 Kalron 스포츠 유니폼 전문 상담사입니다.
다음 원칙을 따라 응답해주세요:
1. 친절하고 전문적인 톤 유지
2. 정확한 정보 제공
3. 고객의 요구사항 정확히 파악
4. 필요시 추가 정보 요청
5. 한국어로 응답`;
  }

  /**
   * LLM에 프롬프트를 전송하고 응답을 받습니다
   */
  async generateResponse(
    prompt: string,
    options: LLMGenerationOptions = {}
  ): Promise<LLMResponse> {
    try {
      // Gemini API와 OpenAI API 분기 처리
      const isGemini = this.apiUrl.includes('generativelanguage.googleapis.com');
      let response;
      if (isGemini) {
        // Gemini API 요청 구조
        const url = `${this.apiUrl}?key=${this.apiKey}`;
        const payload = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt }
              ]
            }
          ]
        };
        response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
        const candidates = (response.data as any).candidates || [];
        const content = candidates[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
        return {
          success: true,
          content
        };
      } else {
        // OpenAI API 요청 구조 (기존 방식)
        const messages = [
          { role: 'system', content: this.defaultSystemPrompt },
          { role: 'user', content: prompt }
        ];
        const payload = {
          model: this.model,
          messages,
          temperature: options.temperature ?? config.llm.temperature,
          max_tokens: options.maxTokens ?? config.llm.maxTokens,
          top_p: options.topP ?? 1,
          frequency_penalty: options.frequencyPenalty ?? 0,
          presence_penalty: options.presencePenalty ?? 0,
          stream: false
        };
        response = await axios.post(
          this.apiUrl,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        const content = (response.data as any).choices?.[0]?.message?.content || '';
        return {
          success: true,
          content
        };
      }
    } catch (error: any) {
      logger.error('Error generating LLM response', { error });
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * 대화 컨텍스트를 포함한 응답 생성
   */
  async generateWithContext(
    conversationId: string,
    userId: string,
    userMessage: string,
    promptTemplate?: PromptTemplate,
    options: LLMGenerationOptions = {}
  ): Promise<LLMResponse> {
    try {
      // 대화 히스토리 가져오기
      const recentMessages = await conversationContextService.getRecentMessages(
        conversationId,
        10
      );

      // 메시지 배열 구성
      const messages = this.buildMessagesWithContext(
        userMessage,
        recentMessages,
        promptTemplate
      );

      const payload = {
        model: this.model,
        messages,
        temperature: options.temperature ?? config.llm.temperature,
        max_tokens: options.maxTokens ?? config.llm.maxTokens,
        stream: false
      };

      const response = await axios.post<{
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      }>(
        this.apiUrl,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data.choices?.[0]?.message?.content;
      const usage = response.data.usage;

      if (!content) {
        throw new Error('No content received from LLM');
      }

      return {
        success: true,
        content: content.trim(),
        answer: content.trim(),
        usage: usage ? {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        } : undefined
      };
    } catch (error) {
      logger.error('Error generating response with context', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * 메시지 배열 구성
   */
  private buildMessagesWithContext(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    promptTemplate?: PromptTemplate
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // 시스템 프롬프트
    const systemPrompt = promptTemplate?.system || this.defaultSystemPrompt;
    messages.push({ role: 'system', content: systemPrompt });

    // 예제 추가 (few-shot learning)
    if (promptTemplate?.examples) {
      for (const example of promptTemplate.examples) {
        messages.push({ role: 'user', content: example.user });
        messages.push({ role: 'assistant', content: example.assistant });
      }
    }

    // 대화 히스토리 추가
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      });
    }

    // 현재 사용자 메시지
    const userContent = [
      promptTemplate?.userPrefix,
      userMessage,
      promptTemplate?.userSuffix
    ].filter(Boolean).join('');

    messages.push({ role: 'user', content: userContent });

    return messages;
  }
}

// 기존 함수들을 LLMService 인스턴스 메서드로 래핑 (이전 버전과의 호환성)
const llmServiceInstance = new LLMService();

export async function generateAnswer(
  userMessage: string,
  context?: unknown, // 더 이상 사용하지 않지만 호환성을 위해 유지
  promptTemplate?: PromptTemplate
): Promise<LLMResponse> {
  // context가 있고 conversationId가 있으면 컨텍스트 포함 생성
  const contextObj = context as { conversationId?: string; userId?: string } | undefined;
  if (contextObj?.conversationId && contextObj?.userId) {
    return llmServiceInstance.generateWithContext(
      contextObj.conversationId,
      contextObj.userId,
      userMessage,
      promptTemplate
    );
  }

  // 그렇지 않으면 단순 생성
  const prompt = promptTemplate?.userPrefix
    ? `${promptTemplate.userPrefix}${userMessage}${promptTemplate.userSuffix || ''}`
    : userMessage;

  return llmServiceInstance.generateResponse(prompt);
}

export async function generateIntentBasedAnswer(
  userMessage: string,
  intentName: string,
  parameters: Record<string, unknown>,
  context?: unknown
): Promise<LLMResponse> {
  // DB에서 인텐트별 프롬프트 템플릿을 가져와야 하지만,
  // 일단은 기본 템플릿 사용
  const promptTemplate: PromptTemplate = {
    system: `당신은 Kalron 스포츠 유니폼 전문 상담사입니다.
현재 감지된 인텐트: ${intentName}
추출된 파라미터: ${JSON.stringify(parameters)}

이 정보를 바탕으로 고객에게 적절한 응답을 제공해주세요.`
  };

  return generateAnswer(userMessage, context, promptTemplate);
}

export function generateFallbackMessage(error?: string): string {
  const fallbackMessages = [
    '문의해 주셔서 감사합니다. 현재 시스템이 혼잡하여 잠시 후 담당자가 연락드리겠습니다.',
    'Thank you for your inquiry. Our system is currently busy. A representative will contact you shortly.',
    '문의해 주셔서 감사합니다. 현재 시스템이 혼잡하여 잠시 후 담당자가 연락드리겠습니다.'
  ];

  logger.warn('Using fallback message', { error });
  return fallbackMessages[0];
}

// ConversationManager 제거 - conversationContextService 사용
// 이전 버전과의 호환성을 위한 더미 객체
export const conversationManager = {
  getOrCreateContext: (_userId: string) => ({ userId: _userId, messages: [] }),
  addMessage: (_userId: string, _role: string, _content: string) => {
    logger.warn('Deprecated conversationManager.addMessage called');
  },
  clearContext: (_userId: string) => {
    logger.warn('Deprecated conversationManager.clearContext called');
  }
};