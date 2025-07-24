import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import logger from '../../utils/logger';

/**
 * 납기/배송시간 문의 처리 프로세서
 * - 100% 자동화 목표
 * - 브랜드별 표준 납기 정보 제공
 */
export class DeliveryTimeProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    try {
      const brand = context.customer?.brand;
      const sportType = context.customer?.sportType;
      const message = this.getDeliveryTimeInfo(brand, sportType);

      logger.info('Delivery time processed successfully', {
        userId: context.userId,
        brand,
        sportType
      });

      return {
        success: true,
        message,
        metadata: {
          requiresApproval: false,
          automationLevel: 100,
          responseType: 'delivery_time',
          source: 'static'
        }
      };

    } catch (error) {
      logger.error('Error in DeliveryTimeProcessor', {
        error,
        userId: context.userId,
        intent: context.intent.intentName
      });

      return {
        success: false,
        message: '죄송합니다. 납기 정보를 확인할 수 없습니다. 담당자에게 문의해 주세요.',
        metadata: { requiresApproval: false }
      };
    }
  }

  /**
   * 컨텍스트 수집 (기본 정보만)
   */
  protected async gatherContext(_context: ProcessorContext): Promise<Record<string, unknown>> {
    return {
      responseType: 'static_delivery_time'
    };
  }

  /**
   * 프롬프트 빌드 (정적 응답이므로 사용하지 않음)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }

  /**
   * 납기 정보 생성
   */
  private getDeliveryTimeInfo(brand?: string | null, sportType?: string | null): string {
    const brandName = this.getBrandName(brand);
    const sportTypeInfo = this.getSportTypeInfo(sportType);

    return `⏰ **${brandName} 납기 안내**
${sportTypeInfo}

📅 **표준 제작 기간:**
• 디자인 확정 → 제작 시작: 1-2일
• 제작 기간: 7-10일 (평균 8일)
• 품질 검수: 1일
• 포장 및 발송: 1일
• **총 소요시간: 10-14일**

🚚 **배송 기간:**
• 일반 지역: 2-3일
• 제주/도서 지역: 3-5일
• 익일 배송: +1일 (추가 비용)

⚡ **빠른 제작 서비스:**
• 7일 제작: +20% 추가 비용
• 5일 제작: +30% 추가 비용
• 3일 제작: +50% 추가 비용

📋 **납기에 영향을 주는 요소:**
• 주문 수량 (50벌 이상 시 +1-2일)
• 디자인 복잡도 (특수 프린팅 시 +2-3일)
• 특수 소재 사용 시 (+3-5일)
• 성수기 (3-5월, 9-11월) (+2-3일)

🎯 **정확한 납기 확인:**
• 주문서 작성 시 정확한 납기 안내
• 제작 진행 상황 실시간 업데이트
• 급한 일정 시 별도 상담 가능

⚠️ **주의사항:**
• 디자인 수정 시 납기 연장
• 결제 완료 후부터 제작 기간 계산
• 공휴일/연휴 기간 제외

💬 **개별 상담:**
특별한 일정이나 대량 주문의 경우 LINE 채팅으로 개별 상담해 드립니다!`;
  }

  /**
   * 브랜드명 반환
   */
  private getBrandName(brand?: string | null): string {
    switch (brand) {
    case 'ILB_MAX':
      return 'ILB-MAX 야구 유니폼';
    case 'MAX2MAX':
      return 'MAX2MAX 축구/농구 유니폼';
    default:
      return 'Kalron 스포츠 유니폼';
    }
  }

  /**
   * 스포츠 타입별 추가 정보
   */
  private getSportTypeInfo(sportType?: string | null): string {
    switch (sportType) {
    case 'BASEBALL':
      return `⚾ **야구 유니폼 특징:**
• 내구성이 중요하여 검수 과정이 까다로움
• 번호/이름 자수 작업 추가 시간 필요`;
    case 'SOCCER':
      return `⚽ **축구 유니폼 특징:**
• 가벼운 소재로 제작 시간 단축
• 메쉬 패널 적용 시 +1일 소요`;
    case 'BASKETBALL':
      return `🏀 **농구 유니폼 특징:**
• 메쉬 소재 특성상 정밀한 재단 필요
• 통기성 확보를 위한 추가 공정`;
    default:
      return '';
    }
  }
}