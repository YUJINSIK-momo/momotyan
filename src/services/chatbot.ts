import { detectIntent, isConfidentIntent, isFallbackIntent } from './dialogflow';
import { generateFallbackMessage } from './llm';
import { IntentProcessorFactory, ProcessorContext } from './intent-processors';
import { conversationContextService } from './conversation-context';
import { conversationService, intentService, customerJourneyService } from './database';
import { teamNormalizationService } from './team-normalization';
import { customerService } from './database';
import { SportType, IntentCategory, CustomerJourneyStage } from '../generated/prisma';
import { config } from '../config';
import logger from '../utils/logger';

// 채팅봇 응답 타입
export interface ChatbotResponse {
  success: boolean;
  message: string;
  intent?: string;
  intentName?: string; // Dialogflow intent name
  intentCategory?: IntentCategory; // Intent category for routing
  confidence?: number;
  metadata?: {
    source: 'dialogflow' | 'llm' | 'fallback' | 'cache' | 'template' | 'static';
    processingTime: number;
    tokens?: number;
  };
}

// 채팅봇 요청 옵션
export interface ChatbotOptions {
  userId: string;
  sessionId?: string;
  useContext?: boolean;
  confidenceThreshold?: number;
}

// 메인 채팅봇 처리 함수
export async function processMessage(
  message: string,
  options: ChatbotOptions
): Promise<ChatbotResponse> {
  const startTime = Date.now();

  try {
    logger.info('Processing chatbot message', {
      userId: options.userId,
      messageLength: message.length
    });

    // 1. Dialogflow를 통한 인텐트 감지
    const intentResult = await detectIntent(message, options.sessionId);

    // 2. 인텐트 신뢰도 확인
    const threshold = options.confidenceThreshold || config.dialogflow.confidenceThreshold;
    const isConfident = isConfidentIntent(intentResult, threshold);
    const isFallback = isFallbackIntent(intentResult);

    logger.info('Intent detection result', {
      intent: intentResult?.intentName,
      confidence: intentResult?.confidence,
      isConfident,
      isFallback
    });

    // 2.5. 고객 여정 단계 업데이트 (나중에 프로세서 응답에 따라 수행)

    // 3. 대화 컨텍스트 관리
    let conversationId: string | undefined;

    if (options.useContext !== false) {
      // DB에서 대화 가져오기 또는 생성
      const conversation = await conversationService.getOrCreateConversation(
        options.userId,
        options.sessionId || `session_${Date.now()}`
      );
      conversationId = conversation.id;

      // 사용자 메시지 저장
      await conversationService.addMessage(conversationId, {
        role: 'user',
        content: message,
        timestamp: new Date(),
        intent: intentResult?.intentName,
        confidence: intentResult?.confidence
      });
    }

    // 4. 응답 생성
    let response: ChatbotResponse;

    if (!isConfident || isFallback || !intentResult) {
      // 신뢰도가 낮거나 폴백인 경우 기본 처리
      response = {
        success: false,
        message: generateFallbackMessage('Low confidence intent'),
        intent: intentResult?.intentName,
        intentName: intentResult?.intentName,
        confidence: intentResult?.confidence,
        metadata: {
          source: 'fallback',
          processingTime: Date.now() - startTime
        }
      };
    } else {
      // Intent Processor를 통한 처리
      const processor = IntentProcessorFactory.getProcessor(intentResult.intentName);

      // 고객 정보 로드
      let customer;
      try {
        customer = await customerService.findByLineUserId(options.userId);
      } catch (error) {
        logger.warn('Failed to load customer', { userId: options.userId, error });
      }

      const processorContext: ProcessorContext = {
        userId: options.userId,
        message,
        intent: intentResult,
        conversationId,
        customer: customer || undefined,
        metadata: {
          sessionId: options.sessionId,
          threshold
        }
      };

      const processorResponse = await processor.process(processorContext);

      // 프로세서가 직접 처리하지 않은 경우에만 중앙에서 저니 업데이트
      if (!processorResponse.metadata?.skipJourneyUpdate) {
        await updateCustomerJourneyStage(options.userId, intentResult.intentName);
      }

      // 인텐트 카테고리 결정
      let intentCategory: IntentCategory | undefined;
      try {
        const intentInfo = await intentService.findByName(intentResult.intentName);
        intentCategory = intentInfo?.category;
      } catch (error) {
        logger.warn('Failed to fetch intent category', { intentName: intentResult.intentName, error });
      }

      response = {
        success: processorResponse.success,
        message: processorResponse.message,
        intent: intentResult.intentName,
        intentName: intentResult.intentName,
        intentCategory,
        confidence: intentResult.confidence,
        metadata: {
          source: (processorResponse.metadata?.source as 'dialogflow' | 'llm' | 'fallback' | 'cache' | 'template' | 'static') || 'llm',
          processingTime: Date.now() - startTime,
          tokens: processorResponse.metadata?.tokens as number | undefined
        }
      };
    }

    // 5. 응답 메시지 저장
    if (conversationId && response.success) {
      await conversationService.addMessage(conversationId, {
        role: 'assistant',
        content: response.message,
        timestamp: new Date()
      });
    }

    logger.info('Chatbot response generated', {
      userId: options.userId,
      source: response.metadata?.source,
      processingTime: response.metadata?.processingTime,
      success: response.success
    });

    return response;

  } catch (error) {
    logger.error('Error processing chatbot message', {
      error,
      userId: options.userId,
      message
    });

    return {
      success: false,
      message: generateFallbackMessage('System error'),
      metadata: {
        source: 'fallback',
        processingTime: Date.now() - startTime
      }
    };
  }
}

// 대화 컨텍스트 초기화
export function clearUserContext(userId: string, sessionId?: string): void {
  if (sessionId) {
    conversationContextService.clearContext(userId, sessionId);
  }
  logger.info('User context cleared', { userId });
}

// 빠른 응답 확인 (캐싱 가능한 정적 응답)
const quickResponses: Record<string, string> = {
  'greeting': '안녕하세요! Kalron 스포츠 유니폼에 오신 것을 환영합니다. 무엇을 도와드릴까요?',
  'goodbye': '감사합니다. 다음에 또 이용해 주세요.',
  'thanks': '도움이 되어서 기쁩니다. 다른 질문이 있으시면 편하게 문의해 주세요.'
};

export async function getQuickResponse(
  message: string,
  options: ChatbotOptions
): Promise<ChatbotResponse | null> {
  const intentResult = await detectIntent(message, options.sessionId);

  if (intentResult &&
      intentResult.confidence > 0.9 &&
      quickResponses[intentResult.intentName]) {

    logger.info('Using quick response', {
      intent: intentResult.intentName,
      userId: options.userId
    });

    return {
      success: true,
      message: quickResponses[intentResult.intentName],
      intent: intentResult.intentName,
      intentName: intentResult.intentName,
      confidence: intentResult.confidence,
      metadata: {
        source: 'static',
        processingTime: 0
      }
    };
  }

  return null;
}

// 배치 메시지 처리
export async function processBatchMessages(
  messages: Array<{ message: string; userId: string }>,
  options?: Partial<ChatbotOptions>
): Promise<ChatbotResponse[]> {
  const results = await Promise.all(
    messages.map(({ message, userId }) =>
      processMessage(message, {
        userId,
        ...options
      })
    )
  );

  return results;
}

/**
 * 고객 여정 단계를 업데이트합니다.
 */
async function updateCustomerJourneyStage(userId: string, intentName: string): Promise<void> {
  try {
    const journeyStageMap: Record<string, CustomerJourneyStage> = {
      // 초기 상호작용
      'greeting': CustomerJourneyStage.FIRST_MESSAGE,

      // 디자인 관련
      'design.request': CustomerJourneyStage.DESIGN_REQUESTING,
      'design.template': CustomerJourneyStage.DESIGN_REQUESTING,
      'design.upload': CustomerJourneyStage.DESIGN_REQUESTING,
      'design.modification': CustomerJourneyStage.DESIGN_MODIFYING,
      'design.confirm': CustomerJourneyStage.DESIGN_CONFIRMED,

      // 주문 관련
      'order.request': CustomerJourneyStage.ORDERSHEET_REQUESTED,
      'order.new': CustomerJourneyStage.ORDERSHEET_REQUESTED,
      'order.additional': CustomerJourneyStage.ORDERSHEET_REQUESTED,
      'order.complete': CustomerJourneyStage.ORDERSHEET_COMPLETED,

      // 결제 관련
      'payment.inquiry': CustomerJourneyStage.PAYMENT_PENDING,
      'payment.complete': CustomerJourneyStage.PAYMENT_COMPLETED,
      'payment.failed': CustomerJourneyStage.PAYMENT_FAILED,

      // 샘플 관련
      'sample.request': CustomerJourneyStage.SAMPLE_REQUESTED,
      'sample.inquiry': CustomerJourneyStage.SAMPLE_REQUESTED,

      // 재구매
      'repurchase': CustomerJourneyStage.REPURCHASE,

      // 배송 관련 (결제 완료 상태 유지)
      'delivery.tracking': CustomerJourneyStage.PAYMENT_COMPLETED,
      'delivery.status': CustomerJourneyStage.PAYMENT_COMPLETED
    };

    const stage = journeyStageMap[intentName];
    if (stage) {
      await customerJourneyService.updateJourneyStage(userId, stage);
    }
  } catch (error) {
    logger.error('Failed to update customer journey stage', { userId, intentName, error });
  }
}

/**
 * LLM이 추출한 팀명을 처리하고 고객 정보를 업데이트합니다.
 */
export async function processTeamName(
  userId: string,
  extractedTeamName: string,
  sportType?: string
): Promise<{
  success: boolean;
  normalizedTeamName?: string;
  isNewTeam?: boolean;
  error?: string;
}> {
  try {
    // 1. 팀명 정규화
    const teamInfo = await teamNormalizationService.normalizeTeamName(extractedTeamName);

    logger.info('Team name normalized', {
      userId,
      original: extractedTeamName,
      normalized: teamInfo.normalizedName,
      isNewTeam: !teamInfo.isExistingTeam
    });

    // 2. 고객 정보 업데이트
    const customer = await customerService.findByLineUserId(userId);

    if (!customer) {
      logger.warn('Customer not found for team update', { userId });
      return {
        success: false,
        error: 'Customer not found'
      };
    }

    // 3. 팀 정보 업데이트
    const sportTypeEnum = sportType ?
      (sportType.toUpperCase() as SportType) :
      undefined;

    await customerService.updateTeamInfo(
      userId,
      teamInfo.normalizedName,
      sportTypeEnum
    );

    // 4. CustomerTeam 모델에도 추가
    const { customerTeamService } = await import('./database');
    await customerTeamService.addTeamToCustomer(customer.id, teamInfo.normalizedName);

    // 5. 새로운 팀인 경우 등록
    if (!teamInfo.isExistingTeam) {
      await teamNormalizationService.registerNewTeam(
        teamInfo.normalizedName,
        [extractedTeamName],
        sportType
      );
    } else if (teamInfo.variations && !teamInfo.variations.includes(extractedTeamName)) {
      // 기존 팀의 새로운 변형 추가
      await teamNormalizationService.addTeamVariation(teamInfo.normalizedName, extractedTeamName);
    }

    return {
      success: true,
      normalizedTeamName: teamInfo.normalizedName,
      isNewTeam: !teamInfo.isExistingTeam
    };
  } catch (error) {
    logger.error('Error processing team name', {
      error,
      userId,
      extractedTeamName
    });

    return {
      success: false,
      error: 'Failed to process team name'
    };
  }
}

/**
 * 고객의 현재 팀 정보를 조회합니다.
 */
export async function getCustomerTeamInfo(userId: string): Promise<{
  teamName?: string;
  sportType?: string;
} | null> {
  try {
    const customer = await customerService.findByLineUserId(userId);

    if (!customer || !customer.teamName) {
      return null;
    }

    return {
      teamName: customer.teamName,
      sportType: customer.sportType || undefined
    };
  } catch (error) {
    logger.error('Error getting customer team info', { error, userId });
    return null;
  }
}