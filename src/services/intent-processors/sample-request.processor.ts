import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import logger from '../../utils/logger';

/**
 * 샘플 요청 처리 프로세서
 * - 100% 자동화 목표
 * - 샘플 신청 폼 링크 자동 발송
 */
export class SampleRequestProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    try {
      // Customer Journey 업데이트는 ChatbotService에서 중앙 관리
      // 'sample.request' intent는 journeyStageMap에서 SAMPLE_REQUESTED로 매핑됨

      // 브랜드별 샘플 신청 폼 링크 생성
      const sampleFormUrl = this.getSampleFormUrl(context.customer?.brand);
      const message = this.buildSampleRequestMessage(
        context.customer?.lineUserName,
        context.customer?.brand,
        sampleFormUrl
      );

      return {
        success: true,
        message,
        metadata: {
          requiresApproval: false,
          automationLevel: 100,
          sampleFormUrl,
          brand: context.customer?.brand
        }
      };

    } catch (error) {
      logger.error('Error in SampleRequestProcessor', {
        error,
        userId: context.userId,
        intent: context.intent.intentName
      });

      return {
        success: false,
        message: '죄송합니다. 샘플 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        metadata: { requiresApproval: false }
      };
    }
  }

  /**
   * 컨텍스트 수집 (기본 정보만)
   */
  protected async gatherContext(_context: ProcessorContext): Promise<Record<string, unknown>> {
    return {
      responseType: 'sample_form_link'
    };
  }

  /**
   * 프롬프트 빌드 (정적 응답이므로 사용하지 않음)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }

  /**
   * 브랜드별 샘플 신청 폼 URL 생성
   */
  private getSampleFormUrl(brand?: string | null): string {
    switch (brand) {
    case 'ILB_MAX':
      return 'https://forms.gle/ilb-max-sample-form';
    case 'MAX2MAX':
      return 'https://forms.gle/max2max-sample-form';
    default:
      return 'https://forms.gle/kalron-sample-form';
    }
  }

  /**
   * 샘플 요청 메시지 생성
   */
  private buildSampleRequestMessage(
    customerName: string | null | undefined,
    brand: string | null | undefined,
    sampleFormUrl: string
  ): string {
    const greeting = customerName ? `${customerName}님` : '고객님';

    let brandInfo = '';
    switch (brand) {
    case 'ILB_MAX':
      brandInfo = '\n\nILB-MAX 야구 유니폼의 고급 원단과 뛰어난 품질을 직접 확인해보세요! ⚾';
      break;
    case 'MAX2MAX':
      brandInfo = '\n\nMAX2MAX 축구/농구 유니폼의 우수한 기능성과 디자인을 체험해보세요! ⚽🏀';
      break;
    default:
      brandInfo = '\n\nKalron 유니폼의 뛰어난 품질을 직접 확인해보세요!';
    }

    return `${greeting}, 안녕하세요! 🎽

샘플 요청을 도와드리겠습니다.${brandInfo}

📝 **샘플 신청 방법:**
아래 링크를 통해 간편하게 신청하실 수 있습니다.

👇 **샘플 신청 폼**
${sampleFormUrl}

📋 **신청 시 필요한 정보:**
• 팀명
• 연락처
• 배송 주소
• 원하는 샘플 종류 (사이즈 샘플/원단 샘플)

📦 **배송 안내:**
• 신청 후 2-3일 내 발송
• 무료 배송 (반송비 고객 부담)
• 샘플 확인 후 7일 내 반송

궁금한 점이 있으시면 언제든 문의해 주세요! 😊`;
  }
}