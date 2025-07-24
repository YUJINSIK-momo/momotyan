import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import { conversationContextService } from '../conversation-context';
import { customerService } from '../database';
import logger from '../../utils/logger';

/**
 * 특정 Processor가 없는 인텐트를 처리하는 기본 Processor
 */
export class DefaultProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    logger.info('Processing with default processor', {
      intent: context.intent.intentName,
      userId: context.userId
    });

    return this.baseProcess(context);
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const gatheredData: Record<string, unknown> = {};

    try {
      // 1. 고객 정보 수집
      const customer = await customerService.findByLineUserId(context.userId);
      if (customer) {
        gatheredData.customerName = customer.lineUserName || '고객님';
        gatheredData.teamName = customer.teamName;
        gatheredData.sportType = customer.sportType;
        gatheredData.brand = customer.brand;
      }

      // 2. 대화 컨텍스트 정보
      if (context.conversationId) {
        const conversationInfo = await conversationContextService.getConversationInfo(
          context.conversationId
        );
        gatheredData.conversationStatus = conversationInfo?.status;
      }

      // 3. Dialogflow 파라미터
      if (context.intent.parameters) {
        gatheredData.parameters = context.intent.parameters;
      }

    } catch (error) {
      logger.error('Error gathering context in default processor', { error });
    }

    return gatheredData;
  }

  protected buildPrompt(
    context: ProcessorContext,
    gatheredData: Record<string, unknown>
  ): string {
    const { teamName, sportType, brand } = gatheredData;

    let prompt = '당신은 Kalron 스포츠 유니폼 전문 상담사입니다.\n\n';

    // 고객 정보가 있으면 추가
    if (teamName) {
      prompt += '현재 상담 중인 고객 정보:\n';
      prompt += `- 팀명: ${teamName}\n`;
      if (sportType) {
        prompt += `- 종목: ${sportType}\n`;
      }
      if (brand) {
        prompt += `- 브랜드: ${brand}\n`;
      }
      prompt += '\n';
    }

    // 인텐트 정보
    prompt += `고객의 의도: ${context.intent.intentName}\n`;
    prompt += `고객 메시지: "${context.message}"\n`;

    // 파라미터가 있으면 추가
    if (gatheredData.parameters && typeof gatheredData.parameters === 'object' && Object.keys(gatheredData.parameters).length > 0) {
      prompt += '\n추출된 정보:\n';
      Object.entries(gatheredData.parameters as Record<string, unknown>).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
    }

    prompt += '\n다음 지침을 따라 응답해주세요:\n';
    prompt += '1. 친절하고 전문적인 톤 유지\n';
    prompt += '2. 2-3문장으로 간결하게 응답\n';
    prompt += '3. 필요시 추가 정보 요청\n';
    prompt += '4. 일본어로 응답 (고객이 일본어 사용 시)\n';

    prompt += '\n응답:';

    return prompt;
  }

  protected async postProcess(
    response: string,
    context: ProcessorContext,
    gatheredData: Record<string, unknown>
  ): Promise<string> {
    // 기본적인 후처리
    const processedResponse = response.trim();

    // 브랜드 정보가 있으면 추가
    if (gatheredData.brand === 'ILB_MAX' && !processedResponse.includes('ILB-MAX')) {
      // 야구 관련 응답인 경우 브랜드 언급 고려
    } else if (gatheredData.brand === 'MAX2MAX' && !processedResponse.includes('MAX2MAX')) {
      // 축구/농구 관련 응답인 경우 브랜드 언급 고려
    }

    return processedResponse;
  }
}