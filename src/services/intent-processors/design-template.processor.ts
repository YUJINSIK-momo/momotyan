import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import logger from '../../utils/logger';

/**
 * 디자인 템플릿 요청 처리 프로세서
 * - 브랜드별 템플릿 카탈로그 제공
 * - 디자인 선택 후 상담 연결
 */
export class DesignTemplateProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    try {
      const brand = context.customer?.brand;
      const sportType = context.customer?.sportType;
      const message = this.getDesignTemplateResponse(brand, sportType);

      logger.info('Design template request processed', {
        userId: context.userId,
        brand,
        sportType
      });

      return {
        success: true,
        message,
        metadata: {
          requiresApproval: false,
          automationLevel: 80,
          responseType: 'design_template',
          nextAction: 'template_selection'
        }
      };

    } catch (error) {
      logger.error('Error in DesignTemplateProcessor', {
        error,
        userId: context.userId,
        intent: context.intent.intentName
      });

      return {
        success: false,
        message: '죄송합니다. 템플릿 정보를 불러올 수 없습니다. 담당자에게 연결해 드리겠습니다.',
        metadata: { requiresApproval: true }
      };
    }
  }

  /**
   * 컨텍스트 수집
   */
  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    return {
      responseType: 'design_template_catalog',
      hasCustomerInfo: !!context.customer,
      brand: context.customer?.brand,
      sportType: context.customer?.sportType
    };
  }

  /**
   * 프롬프트 빌드 (정적 응답이므로 사용하지 않음)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }

  /**
   * 디자인 템플릿 응답 생성
   */
  private getDesignTemplateResponse(brand?: string | null, sportType?: string | null): string {
    const brandName = this.getBrandName(brand);
    const templateUrl = this.getTemplateUrl(brand, sportType);

    return `🎨 **${brandName} 디자인 템플릿 카탈로그**

${this.getSportSpecificTemplates(sportType)}

📋 **템플릿 카탈로그 보기:**
${templateUrl}

💡 **템플릿 이용 안내:**
• 기본 템플릿: 무료 제공
• 색상 변경: 무료 (5가지 색상 내)
• 로고/텍스트 변경: 무료
• 레이아웃 변경: 별도 상담

🎯 **선택 방법:**
1. 위 링크에서 원하는 템플릿 확인
2. "T-001번 템플릿으로 하고 싶어요" 형식으로 말씀
3. 팀명, 로고, 색상 등 세부사항 상담

⚡ **빠른 진행:**
• 템플릿 선택 시 3일 단축 제작
• 디자인 확정 즉시 제작 시작
• 수정 횟수 1회로 제한

💬 **다음 단계:**
템플릿을 확인하신 후 원하는 번호나 스타일을 알려주시면 바로 상담을 도와드립니다!

🔗 **직접 상담 원하시면:**
"디자이너와 직접 상담하고 싶어요"라고 말씀해 주세요.`;
  }

  /**
   * 브랜드명 반환
   */
  private getBrandName(brand?: string | null): string {
    switch (brand) {
    case 'ILB_MAX':
      return 'ILB-MAX 야구';
    case 'MAX2MAX':
      return 'MAX2MAX 축구/농구';
    default:
      return 'Kalron 스포츠';
    }
  }

  /**
   * 템플릿 URL 생성
   */
  private getTemplateUrl(brand?: string | null, sportType?: string | null): string {
    // 실제 환경에서는 진짜 템플릿 카탈로그 URL을 사용
    const baseUrl = 'https://kalron.co.kr/templates';

    if (brand === 'ILB_MAX' || sportType === 'BASEBALL') {
      return `${baseUrl}/baseball-templates`;
    }

    if (brand === 'MAX2MAX') {
      if (sportType === 'SOCCER') {
        return `${baseUrl}/soccer-templates`;
      }
      if (sportType === 'BASKETBALL') {
        return `${baseUrl}/basketball-templates`;
      }
      return `${baseUrl}/max2max-templates`;
    }

    return `${baseUrl}/all-sports`;
  }

  /**
   * 스포츠별 템플릿 정보
   */
  private getSportSpecificTemplates(sportType?: string | null): string {
    switch (sportType) {
    case 'BASEBALL':
      return `⚾ **야구 전용 템플릿 (50가지)**
• 클래식 스타일: T-B001~T-B020
• 모던 스타일: T-B021~T-B040  
• 프로팀 스타일: T-B041~T-B050`;

    case 'SOCCER':
      return `⚽ **축구 전용 템플릿 (40가지)**
• 유럽 클럽 스타일: T-S001~T-S015
• 국가대표 스타일: T-S016~T-S030
• 커스텀 디자인: T-S031~T-S040`;

    case 'BASKETBALL':
      return `🏀 **농구 전용 템플릿 (35가지)**
• NBA 스타일: T-K001~T-K015
• 대학팀 스타일: T-K016~T-K025
• 스트리트 스타일: T-K026~T-K035`;

    default:
      return `🏆 **전체 템플릿 (125가지)**
• 야구: 50가지 템플릿
• 축구: 40가지 템플릿  
• 농구: 35가지 템플릿`;
    }
  }
}