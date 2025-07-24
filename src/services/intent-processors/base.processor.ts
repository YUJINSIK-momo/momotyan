import { IntentDetectionResult } from '../dialogflow';
import { LLMService } from '../llm';
import { intentService, IntentResponseStrategy } from '../database/intent.service';
import { conversationContextService } from '../conversation-context';
import { Customer } from '../../generated/prisma';
import logger from '../../utils/logger';

export interface ProcessorContext {
  userId: string;
  message: string;
  intent: IntentDetectionResult;
  conversationId?: string;
  customer?: Customer;
  metadata?: Record<string, unknown>;
}

export interface ProcessorResponse {
  success: boolean;
  message: string;
  requiresApproval?: boolean;
  metadata?: Record<string, unknown> & {
    skipJourneyUpdate?: boolean; // 프로세서가 직접 처리한 경우 true
  };
}

export abstract class BaseIntentProcessor {
  protected llmService: LLMService;
  protected responseStrategy?: IntentResponseStrategy;

  constructor() {
    this.llmService = new LLMService();
  }

  /**
   * 메인 처리 메서드 - 모든 Processor가 구현해야 함
   */
  abstract process(context: ProcessorContext): Promise<ProcessorResponse>;

  /**
   * 필요한 컨텍스트 데이터 수집 - 각 Processor가 오버라이드
   */
  protected abstract gatherContext(context: ProcessorContext): Promise<Record<string, unknown>>;

  /**
   * LLM 프롬프트 구성 - 각 Processor가 오버라이드
   */
  protected abstract buildPrompt(
    context: ProcessorContext,
    gatheredData: Record<string, unknown>
  ): string;

  /**
   * 응답 후처리 - 필요시 오버라이드
   */
  protected async postProcess(
    response: string,
    _context: ProcessorContext,
    _gatheredData: Record<string, unknown>
  ): Promise<string> {
    // 기본적으로는 그대로 반환
    return response;
  }

  /**
   * 기본 처리 플로우
   */
  protected async baseProcess(context: ProcessorContext): Promise<ProcessorResponse> {
    const startTime = Date.now();

    try {
      // 1. 응답 전략 로드
      this.responseStrategy = await intentService.getResponseStrategy(
        context.intent.intentName
      );

      logger.info('Processing intent with strategy', {
        intent: context.intent.intentName,
        strategy: this.responseStrategy.strategy,
        userId: context.userId
      });

      // 2. 전략별 처리
      let response: string;
      let source: 'cache' | 'template' | 'llm' | 'static';

      switch (this.responseStrategy.strategy) {
      case 'STATIC':
        response = await this.handleStaticResponse(context);
        source = 'static';
        break;

      case 'TEMPLATE':
        response = await this.handleTemplateResponse(context);
        source = 'template';
        break;

      case 'DYNAMIC':
      case 'HYBRID':
        response = await this.handleDynamicResponse(context);
        source = 'llm';
        break;

      default:
        response = await this.handleDynamicResponse(context);
        source = 'llm';
      }

      // 3. 대화 컨텍스트 업데이트
      if (context.conversationId) {
        await conversationContextService.addMessage(
          context.conversationId,
          context.userId,
          'assistant',
          response,
          {
            intent: context.intent.intentName,
            confidence: context.intent.confidence,
            strategy: this.responseStrategy.strategy
          }
        );
      }

      return {
        success: true,
        message: response,
        metadata: {
          source,
          processingTime: Date.now() - startTime
        }
      };

    } catch (error) {
      logger.error('Error in intent processor', {
        error,
        intent: context.intent.intentName,
        userId: context.userId
      });

      return {
        success: false,
        message: this.getFallbackMessage(),
        metadata: {
          source: 'static',
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * 정적 응답 처리
   */
  protected async handleStaticResponse(context: ProcessorContext): Promise<string> {
    const intent = await intentService.findByName(context.intent.intentName);

    if (intent?.responseTemplate) {
      return intent.responseTemplate;
    }

    return this.getFallbackMessage();
  }

  /**
   * 템플릿 응답 처리
   */
  protected async handleTemplateResponse(context: ProcessorContext): Promise<string> {
    const intent = await intentService.findByName(context.intent.intentName);

    if (!intent?.responseTemplate) {
      return this.handleDynamicResponse(context);
    }

    // 컨텍스트 데이터 수집
    const gatheredData = await this.gatherContext(context);

    // 템플릿 변수 치환
    let response = intent.responseTemplate;

    // {{variable}} 형식의 변수를 치환
    Object.entries(gatheredData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      response = response.replace(regex, String(value));
    });

    // 후처리
    return this.postProcess(response, context, gatheredData);
  }

  /**
   * 동적 응답 처리 (LLM 사용)
   */
  protected async handleDynamicResponse(context: ProcessorContext): Promise<string> {
    // 1. 컨텍스트 데이터 수집
    const gatheredData = await this.gatherContext(context);

    // 2. 대화 히스토리 가져오기
    const _conversationHistory = context.conversationId
      ? await conversationContextService.getRecentMessages(
        context.conversationId,
        10
      )
      : [];

    // 3. 프롬프트 구성
    const prompt = this.buildPrompt(context, gatheredData);

    // 4. LLM 호출
    const llmResponse = await this.llmService.generateResponse(
      prompt,
      {
        temperature: 0.7,
        maxTokens: 500
      }
    );

    if (!llmResponse.success || !llmResponse.content) {
      logger.error('LLM response failed', {
        intent: context.intent.intentName,
        error: llmResponse.error
      });
      return this.getFallbackMessage();
    }

    // 5. 후처리
    return this.postProcess(llmResponse.content, context, gatheredData);
  }

  /**
   * 폴백 메시지
   */
  protected getFallbackMessage(): string {
    return '죄송합니다. 문의 내용을 이해하지 못했습니다. 다시 시도하시거나 다른 표현으로 문의해 주세요.';
  }

  /**
   * 캐시 키 생성
   */
  protected getCacheKey(context: ProcessorContext): string {
    return `intent:${context.intent.intentName}:${context.userId}:${context.message}`;
  }
}