import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import { customerTeamService } from '../database';
import logger from '../../utils/logger';

/**
 * Greeting 인텐트 프로세서
 * 고객이 처음 인사할 때 팀 정보를 확인하고,
 * 팀 정보가 없으면 팀 이름을 요청합니다.
 */
export class GreetingProcessor extends BaseIntentProcessor {
  protected intentName = 'greeting';

  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    const { customer } = context;

    // 고객 정보가 없는 경우 (이미 line.ts에서 생성되어야 함)
    if (!customer) {
      logger.error('Customer not found in greeting processor', { userId: context.userId });
      return {
        success: false,
        message: this.getErrorMessage(),
        metadata: { requiresApproval: false }
      };
    }

    // Customer Journey 업데이트는 ChatbotService에서 중앙 관리
    // 'greeting' intent는 항상 FIRST_MESSAGE로 매핑됨

    // 고객의 팀 정보 확인
    const customerTeams = await customerTeamService.findByCustomerId(customer.id);
    const hasTeamInfo = customerTeams.length > 0 || !!customer.teamName;

    if (!hasTeamInfo) {
      // 팀 정보가 없는 경우 - 팀 이름 요청
      return {
        success: true,
        message: this.getTeamRequestMessage(customer.lineUserName, customer.brand),
        metadata: {
          requiresApproval: false,
          hasTeamInfo: false,
          needsTeamRegistration: true,
          brand: customer.brand
        }
      };
    }

    // 팀 정보가 있는 경우 - 환영 메시지
    const teamNames = this.getTeamNames(customerTeams, customer.teamName);
    return {
      success: true,
      message: this.getWelcomeMessageWithTeam(customer.lineUserName, teamNames, customer.brand),
      metadata: {
        requiresApproval: false,
        hasTeamInfo: true,
        teams: teamNames,
        brand: customer.brand
      }
    };
  }

  /**
   * 팀 정보 요청 메시지
   */
  private getTeamRequestMessage(userName?: string | null, brand?: string | null): string {
    const name = userName ? `${userName}님` : '고객님';
    const brandName = this.getBrandName(brand);

    return `${name}, 안녕하세요! ${brandName}에 오신 것을 환영합니다. 👋

원활한 상담을 위해 팀 이름을 알려주시겠어요?

예시: "저희는 서울 이글스입니다" 또는 "부산 타이거즈라는 팀입니다"`;
  }

  /**
   * 팀 정보가 있는 고객을 위한 환영 메시지
   */
  private getWelcomeMessageWithTeam(userName: string | null | undefined, teamNames: string[], brand: string | null | undefined): string {
    const name = userName ? `${userName}님` : '고객님';
    const teamInfo = teamNames.length > 1
      ? `${teamNames.join(', ')}`
      : teamNames[0];
    const brandName = this.getBrandName(brand);

    return `${teamInfo} 팀의 ${name}, 다시 찾아주셔서 감사합니다! 
${brandName}을 이용해 주셔서 감사합니다. 🙏

오늘은 어떤 도움이 필요하신가요?
- 유니폼 추가 주문
- 디자인 수정
- 주문 상태 확인
- 기타 문의사항`;
  }

  /**
   * 에러 메시지
   */
  private getErrorMessage(): string {
    return '죄송합니다. 시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  /**
   * 브랜드명 가져오기
   */
  private getBrandName(brand?: string | null): string {
    switch (brand) {
    case 'ILB_MAX':
      return 'ILB-MAX 야구 유니폼 전문점';
    case 'MAX2MAX':
      return 'MAX2MAX 스포츠 유니폼';
    default:
      return 'Kalron 스포츠 유니폼';
    }
  }

  /**
   * 고객의 팀 이름 목록 추출
   */
  private getTeamNames(customerTeams: { teamName: string; isActive: boolean }[], legacyTeamName?: string | null): string[] {
    const teamNames = new Set<string>();

    // CustomerTeam 모델에서 팀명 추출
    customerTeams.forEach(ct => {
      if (ct.teamName && ct.isActive) {
        teamNames.add(ct.teamName);
      }
    });

    // 레거시 teamName 필드도 확인
    if (legacyTeamName) {
      teamNames.add(legacyTeamName);
    }

    return Array.from(teamNames);
  }

  /**
   * 컨텍스트 수집은 기본 구현 사용
   */
  protected async gatherContext(_context: ProcessorContext): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * 프롬프트 빌딩은 사용하지 않음 (정적 메시지 사용)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }
}