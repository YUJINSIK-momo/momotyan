import { BaseIntentProcessor } from './base.processor';
import { ProcessorContext, ProcessorResponse } from './base.processor';
import { designService, customerService } from '../database';
import logger from '../../utils/logger';

export class DesignRequestProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    return this.baseProcess(context);
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const { userId } = context;

    try {
      // 고객 정보 조회
      const customer = await customerService.findByLineUserId(userId);

      // 기존 디자인 정보 조회
      const existingDesign = customer ? await designService.findLatestByCustomerId(customer.id) : null;

      // 수정 횟수 통계
      const revisionStats = customer ? await designService.getRevisionStats(customer.id) : null;

      return {
        customerName: customer?.lineUserName || 'お客様',
        teamName: customer?.teamName,
        hasExistingDesign: !!existingDesign,
        totalRevisions: revisionStats?.totalRevisions || 0,
        sportType: customer?.sportType
      };
    } catch (error) {
      logger.error('Failed to gather design context', { userId, error });
      return {
        customerName: 'お客様'
      };
    }
  }

  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { message } = context;
    const { customerName, teamName, hasExistingDesign, totalRevisions, sportType } = gatheredData;

    let promptContext = '고객이 유니폼 디자인 요청을 하고 있습니다.\n\n';
    promptContext += '고객 정보:\n';
    promptContext += `- 이름: ${customerName}\n`;

    if (teamName) {
      promptContext += `- 팀명: ${teamName}\n`;
    }

    if (sportType) {
      promptContext += `- 종목: ${sportType}\n`;
    }

    if (hasExistingDesign) {
      promptContext += `- 기존 디자인 있음 (수정 횟수: ${totalRevisions}회)\n`;
    } else {
      promptContext += '- 신규 디자인 요청\n';
    }

    promptContext += `\n고객 메시지: "${message}"\n\n`;
    promptContext += '응답 가이드라인:\n';
    promptContext += '1. 친절하고 전문적인 톤 유지\n';
    promptContext += '2. 디자인 요청사항을 확인하고 정리\n';
    promptContext += '3. 필요한 추가 정보가 있다면 질문\n';
    promptContext += '4. 디자인 작업이 시작되면 알려주겠다고 안내\n';
    promptContext += '5. 일본어로 응답\n';

    return promptContext;
  }

  protected async postProcess(response: string, context: ProcessorContext, _gatheredData: Record<string, unknown>): Promise<string> {
    // 디자인 요청 시 Design 레코드 생성
    try {
      const customer = await customerService.findByLineUserId(context.userId);
      if (customer) {
        const existingDesign = await designService.findLatestByCustomerId(customer.id);

        if (!existingDesign) {
          // 신규 디자인 생성
          await designService.create({
            customer: { connect: { id: customer.id } }
          });
          logger.info('Created new design record', { customerId: customer.id });
        }
      }
    } catch (error) {
      logger.error('Failed to create design record', { error });
    }

    return response;
  }
}