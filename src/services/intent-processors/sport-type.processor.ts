import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService } from '../database';
import { SportType } from '../../generated/prisma';
import logger from '../../utils/logger';

/**
 * 스포츠 종목 확인 프로세서
 * - 야구/축구/농구 종목 확인 및 저장
 * - 브랜드별 전문 서비스 안내
 */
export class SportTypeProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    try {
      const extractedSportType = this.extractSportType(context.message);
      const message = await this.buildSportTypeResponse(context, extractedSportType);

      // 스포츠 타입이 확인된 경우 고객 정보 업데이트
      if (extractedSportType && context.customer) {
        await customerService.updateTeamInfo(
          context.userId,
          context.customer.teamName || '',
          extractedSportType
        );
        logger.info('Sport type updated', {
          userId: context.userId,
          sportType: extractedSportType
        });
      }

      return {
        success: true,
        message,
        metadata: {
          requiresApproval: false,
          automationLevel: 90,
          responseType: 'sport_type_confirmation',
          sportType: extractedSportType
        }
      };

    } catch (error) {
      logger.error('Error in SportTypeProcessor', {
        error,
        userId: context.userId,
        intent: context.intent.intentName
      });

      return {
        success: false,
        message: '죄송합니다. 종목 확인 중 오류가 발생했습니다. 담당자에게 연결해 드리겠습니다.',
        metadata: { requiresApproval: true }
      };
    }
  }

  /**
   * 컨텍스트 수집
   */
  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const customer = context.customer;
    return {
      hasCustomer: !!customer,
      currentBrand: customer?.brand,
      currentSportType: customer?.sportType,
      teamName: customer?.teamName
    };
  }

  /**
   * 프롬프트 빌드 (정적 응답이므로 사용하지 않음)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }

  /**
   * 메시지에서 스포츠 타입 추출
   */
  private extractSportType(message: string): SportType | null {
    const messageNormalized = message.toLowerCase();

    // 야구 관련 키워드
    if (messageNormalized.includes('야구') ||
        messageNormalized.includes('베이스볼') ||
        messageNormalized.includes('baseball')) {
      return SportType.BASEBALL;
    }

    // 축구 관련 키워드
    if (messageNormalized.includes('축구') ||
        messageNormalized.includes('사커') ||
        messageNormalized.includes('soccer') ||
        messageNormalized.includes('풋볼')) {
      return SportType.SOCCER;
    }

    // 농구 관련 키워드
    if (messageNormalized.includes('농구') ||
        messageNormalized.includes('바스켓볼') ||
        messageNormalized.includes('basketball')) {
      return SportType.BASKETBALL;
    }

    return null;
  }

  /**
   * 스포츠 타입별 응답 생성
   */
  private async buildSportTypeResponse(context: ProcessorContext, sportType: SportType | null): Promise<string> {
    const customer = context.customer;
    const brand = customer?.brand;

    if (sportType) {
      // 스포츠 타입이 확인된 경우
      return this.getSportTypeConfirmationMessage(sportType, brand);
    } else {
      // 스포츠 타입을 명확히 확인할 수 없는 경우
      return this.getSportTypeInquiryMessage(brand);
    }
  }

  /**
   * 스포츠 타입 확인 메시지
   */
  private getSportTypeConfirmationMessage(sportType: SportType, brand?: string | null): string {
    const sportName = this.getSportName(sportType);
    const brandInfo = this.getBrandInfo(brand, sportType);

    return `${sportName} 유니폼 제작을 원하시는군요! 👍

${brandInfo}

🎯 **다음 단계 안내:**
• 디자인 상담: 기존 디자인이 있으시거나 새로 제작을 원하시나요?
• 주문 수량: 대략 몇 벌 정도 제작 예정이신가요?
• 희망 납기: 언제까지 필요하신가요?

💬 **계속 진행하시려면:**
"디자인 상담 받고 싶어요" 또는 "주문하고 싶습니다"라고 말씀해 주세요!`;
  }

  /**
   * 스포츠 타입 문의 메시지
   */
  private getSportTypeInquiryMessage(brand?: string | null): string {
    const brandName = brand === 'ILB_MAX' ? 'ILB-MAX' : brand === 'MAX2MAX' ? 'MAX2MAX' : 'Kalron';

    return `${brandName}에서 어떤 종목의 유니폼을 제작하시나요? 🤔

⚾ **야구 유니폼** (ILB-MAX 전문)
• 내구성 강화 소재
• 전문 야구용 디자인
• 번호/이름 자수 서비스

⚽ **축구 유니폼** (MAX2MAX 전문)  
• 경량 통기성 소재
• 최신 축구 트렌드 디자인
• 클럽/국가대표 스타일

🏀 **농구 유니폼** (MAX2MAX 전문)
• 메쉬 통기성 최대화
• 활동성 중심 디자인
• 프로리그 스타일

💬 **종목을 알려주세요:**
"야구 유니폼", "축구 유니폼", "농구 유니폼" 중 하나를 선택해 주시면 전문 상담을 도와드립니다!`;
  }

  /**
   * 스포츠명 반환
   */
  private getSportName(sportType: SportType): string {
    switch (sportType) {
    case SportType.BASEBALL:
      return '⚾ 야구';
    case SportType.SOCCER:
      return '⚽ 축구';
    case SportType.BASKETBALL:
      return '🏀 농구';
    default:
      return '스포츠';
    }
  }

  /**
   * 브랜드별 전문 정보
   */
  private getBrandInfo(brand?: string | null, sportType?: SportType): string {
    if (sportType === SportType.BASEBALL || brand === 'ILB_MAX') {
      return `🏆 **ILB-MAX 야구 전문 브랜드**
• 20년 이상 야구 유니폼 전문 제작
• 프로야구단 납품 경험 다수
• 야구 전용 고급 소재 사용`;
    }

    if ((sportType === SportType.SOCCER || sportType === SportType.BASKETBALL) || brand === 'MAX2MAX') {
      return `🏆 **MAX2MAX 축구/농구 전문 브랜드**
• 최신 스포츠 트렌드 반영
• 해외 유명 브랜드급 품질
• 프로팀 스타일 디자인`;
    }

    return `🏆 **Kalron 스포츠 유니폼**
• 모든 종목 전문 제작
• 맞춤형 디자인 서비스
• 고품질 보장`;
  }
}