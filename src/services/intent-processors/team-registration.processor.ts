import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService, customerTeamService, customerJourneyService } from '../database';
import { teamNormalizationService } from '../team-normalization';
import { CustomerJourneyStage, SportType } from '../../generated/prisma';
import logger from '../../utils/logger';

/**
 * Team Registration 인텐트 프로세서
 * 고객이 팀 이름을 제공할 때 이를 추출하고 저장합니다.
 */
export class TeamRegistrationProcessor extends BaseIntentProcessor {
  protected intentName = 'team.registration';

  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    const { customer } = context;

    // 고객 정보 확인
    if (!customer) {
      logger.error('Customer not found in team registration processor', { userId: context.userId });
      return {
        success: false,
        message: '죄송합니다. 고객 정보를 찾을 수 없습니다. 다시 시도해 주세요.',
        metadata: { requiresApproval: false }
      };
    }

    // BaseProcessor의 baseProcess 사용하여 LLM으로 팀 이름 추출
    const result = await this.baseProcess(context);

    // 프로세서가 직접 Journey 업데이트를 처리하므로 skipJourneyUpdate 설정
    return {
      ...result,
      metadata: {
        ...result.metadata,
        skipJourneyUpdate: true
      }
    };
  }

  /**
   * LLM에게 전달할 컨텍스트 수집
   */
  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const gatheredData: Record<string, unknown> = {};

    // 고객 정보
    if (context.customer) {
      gatheredData.customerName = context.customer.lineUserName || '고객님';
      gatheredData.existingTeamName = context.customer.teamName;
      gatheredData.brand = context.customer.brand;
      gatheredData.sportType = context.customer.sportType;
    }

    // Dialogflow에서 추출한 파라미터
    if (context.intent.parameters?.team_name) {
      gatheredData.extractedTeamName = context.intent.parameters.team_name;
    }

    return gatheredData;
  }

  /**
   * LLM 프롬프트 생성
   */
  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { brand } = gatheredData;

    let prompt = '당신은 Kalron 스포츠 유니폼 전문 상담사입니다.\n\n';
    prompt += '고객이 팀 이름을 알려주었습니다. 메시지에서 팀 이름을 정확히 추출하고, 팀 등록을 확인하는 메시지를 작성해주세요.\n\n';

    // 브랜드 정보
    if (brand === 'ILB_MAX') {
      prompt += '브랜드: ILB-MAX (야구 유니폼 전문)\n';
    } else if (brand === 'MAX2MAX') {
      prompt += '브랜드: MAX2MAX (축구/농구 유니폼)\n';
    }

    prompt += `고객 메시지: "${context.message}"\n\n`;

    // Dialogflow가 추출한 팀명이 있으면 참고
    if (gatheredData.extractedTeamName) {
      prompt += `참고: 시스템이 추출한 팀명은 "${gatheredData.extractedTeamName}"입니다.\n\n`;
    }

    prompt += '다음 형식으로 응답해주세요:\n';
    prompt += '1. 먼저 추출한 팀 이름을 [TEAM_NAME:팀이름] 형식으로 표시\n';
    prompt += '2. 팀 등록 확인 메시지 (2-3문장)\n';
    prompt += '3. 다음 단계 안내 (유니폼 제작 관련)\n\n';

    prompt += '예시:\n';
    prompt += '[TEAM_NAME:서울 이글스]\n';
    prompt += '서울 이글스 팀으로 등록되었습니다! 🎉\n';
    prompt += '최고의 야구 유니폼을 제작해드리겠습니다.\n\n';
    prompt += '어떤 도움이 필요하신가요?\n';
    prompt += '- 유니폼 디자인 의뢰\n';
    prompt += '- 견적 문의\n';
    prompt += '- 샘플 요청\n\n';

    prompt += '응답:';

    return prompt;
  }

  /**
   * LLM 응답 후처리
   */
  protected async postProcess(
    response: string,
    context: ProcessorContext,
    _gatheredData: Record<string, unknown>
  ): Promise<string> {
    // 1. 응답에서 팀 이름 추출
    const teamNameMatch = response.match(/\[TEAM_NAME:(.+?)\]/);
    const extractedTeamName = teamNameMatch ? teamNameMatch[1].trim() : null;

    if (!extractedTeamName) {
      logger.error('Failed to extract team name from LLM response', { response });
      return '팀 이름을 찾을 수 없습니다. 다시 한 번 팀 이름을 알려주시겠어요?';
    }

    try {
      // 2. 팀 정규화
      const normalizedTeamInfo = await teamNormalizationService.normalizeTeamName(extractedTeamName);

      // 3. 고객-팀 연결
      if (context.customer) {
        await customerTeamService.addTeamToCustomer(context.customer.id, normalizedTeamInfo.normalizedName);
      }

      // 4. 고객 정보 업데이트
      if (context.customer && !context.customer.teamName) {
        await customerService.update(
          { id: context.customer.id },
          { teamName: normalizedTeamInfo.normalizedName }
        );
      }

      // 5. 스포츠 타입 결정 및 업데이트
      const sportType = this.determineSportType(context.customer?.brand, extractedTeamName);
      if (sportType && context.customer && !context.customer.sportType) {
        await customerService.update(
          { id: context.customer.id },
          { sportType }
        );
      }

      // 6. Journey 업데이트 - 팀 등록 성공 시에만 DESIGN_REQUESTING으로 진행
      if (context.customer) {
        await customerJourneyService.updateJourneyStage(
          context.customer.id,
          CustomerJourneyStage.DESIGN_REQUESTING
        );
      }

      // 7. 신규 팀인 경우 팀 등록
      if (!normalizedTeamInfo.isExistingTeam) {
        await teamNormalizationService.registerNewTeam(
          normalizedTeamInfo.normalizedName,
          [extractedTeamName],
          sportType || undefined
        );
      }

      // 8. 응답에서 [TEAM_NAME:...] 태그 제거
      const cleanResponse = response.replace(/\[TEAM_NAME:.+?\]\n?/, '');

      return cleanResponse;

    } catch (error) {
      logger.error('Failed to register team', { error, teamName: extractedTeamName });
      return '팀 등록 중 오류가 발생했습니다. 다시 시도해 주세요.';
    }
  }

  /**
   * 스포츠 타입 결정
   */
  private determineSportType(brand?: string | null, teamName?: string): SportType | null {
    // ILB_MAX는 항상 야구
    if (brand === 'ILB_MAX') {
      return SportType.BASEBALL;
    }

    // MAX2MAX의 경우 팀 이름에서 힌트 찾기
    if (brand === 'MAX2MAX') {
      const lowerTeamName = teamName?.toLowerCase() || '';

      if (lowerTeamName.includes('fc') || lowerTeamName.includes('축구') || lowerTeamName.includes('soccer')) {
        return SportType.SOCCER;
      }
      if (lowerTeamName.includes('농구') || lowerTeamName.includes('basketball') || lowerTeamName.includes('bk')) {
        return SportType.BASKETBALL;
      }
    }

    return null;
  }
}