import { BaseIntentProcessor } from './base.processor';
import { ProcessorContext, ProcessorResponse } from './base.processor';
import { designService, customerService } from '../database';
import logger from '../../utils/logger';

export class DesignModificationProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    return this.baseProcess(context);
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const { userId, message } = context;

    try {
      // 고객 정보 조회
      const customer = await customerService.findByLineUserId(userId);

      // 기존 디자인 정보 조회
      const existingDesign = customer ? await designService.findLatestByCustomerId(customer.id) : null;

      // 수정 횟수 통계
      const revisionStats = customer ? await designService.getRevisionStats(customer.id) : null;

      // 메시지에서 수정 차수 자동 감지 및 업데이트
      if (customer && message) {
        await designService.incrementRevisionByMessage(customer.id, message);
      }

      return {
        customerName: customer?.lineUserName || 'お客様',
        teamName: customer?.teamName,
        hasExistingDesign: !!existingDesign,
        revision1Count: revisionStats?.revision1 || 0,
        revision2Count: revisionStats?.revision2 || 0,
        revision3Count: revisionStats?.revision3 || 0,
        totalRevisions: revisionStats?.totalRevisions || 0
      };
    } catch (error) {
      logger.error('Failed to gather design modification context', { userId, error });
      return {
        customerName: 'お客様'
      };
    }
  }

  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { message } = context;
    const {
      customerName,
      teamName,
      hasExistingDesign,
      revision1Count,
      revision2Count,
      revision3Count,
      totalRevisions
    } = gatheredData;

    let promptContext = '고객이 유니폼 디자인 수정을 요청하고 있습니다.\n\n';
    promptContext += '고객 정보:\n';
    promptContext += `- 이름: ${customerName}\n`;

    if (teamName) {
      promptContext += `- 팀명: ${teamName}\n`;
    }

    if (hasExistingDesign) {
      promptContext += '\n수정 이력:\n';
      promptContext += `- 1차 수정: ${revision1Count}회\n`;
      promptContext += `- 2차 수정: ${revision2Count}회\n`;
      promptContext += `- 3차 수정: ${revision3Count}회\n`;
      promptContext += `- 총 수정 횟수: ${totalRevisions}회\n`;
    }

    promptContext += `\n고객 메시지: "${message}"\n\n`;
    promptContext += '응답 가이드라인:\n';
    promptContext += '1. 수정 요청사항을 명확히 이해했다고 표현\n';
    promptContext += '2. 구체적인 수정 내용을 정리하여 확인\n';
    promptContext += '3. 디자이너에게 전달하겠다고 안내\n';
    promptContext += '4. 예상 소요 시간 안내 (1-2일)\n';
    promptContext += '5. 친절하고 전문적인 톤 유지\n';
    promptContext += '6. 일본어로 응답\n';

    return promptContext;
  }

  protected async postProcess(response: string, context: ProcessorContext, _gatheredData: Record<string, unknown>): Promise<string> {
    // 수정 요청이 처리되었음을 로그
    try {
      const customer = await customerService.findByLineUserId(context.userId);
      if (customer) {
        const design = await designService.findLatestByCustomerId(customer.id);
        if (design) {
          logger.info('Design modification request processed', {
            customerId: customer.id,
            designId: design.id,
            totalRevisions: design.revision1Count + design.revision2Count + design.revision3Count
          });
        }
      }
    } catch (error) {
      logger.error('Failed to log design modification', { error });
    }

    return response;
  }
}