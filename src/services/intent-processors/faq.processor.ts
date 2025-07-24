import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import logger from '../../utils/logger';

/**
 * FAQ 처리 프로세서
 * - 100% 자동화 목표
 * - 자주 묻는 질문에 대한 즉시 응답 제공
 */
export class FAQProcessor extends BaseIntentProcessor {
  private faqDatabase: Record<string, string> = {
    'contact.info': this.getContactInfo(),
    'business.hours': this.getBusinessHours(),
    'material.info': this.getMaterialInfo(),
    'size.guide': this.getSizeGuide(),
    'shipping.policy': this.getShippingPolicy(),
    'refund.policy': this.getRefundPolicy()
  };

  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    try {
      const intentName = context.intent.intentName;
      const message = this.getFAQResponse(intentName, context.customer?.brand);

      logger.info('FAQ processed successfully', {
        intentName,
        userId: context.userId,
        brand: context.customer?.brand
      });

      return {
        success: true,
        message,
        metadata: {
          requiresApproval: false,
          automationLevel: 100,
          responseType: 'faq',
          category: this.getFAQCategory(intentName)
        }
      };

    } catch (error) {
      logger.error('Error in FAQProcessor', {
        error,
        userId: context.userId,
        intent: context.intent.intentName
      });

      return {
        success: false,
        message: '죄송합니다. 요청하신 정보를 찾을 수 없습니다. 담당자에게 문의해 주세요.',
        metadata: { requiresApproval: false }
      };
    }
  }

  /**
   * 컨텍스트 수집 (기본 정보만)
   */
  protected async gatherContext(_context: ProcessorContext): Promise<Record<string, unknown>> {
    return {
      responseType: 'static_faq'
    };
  }

  /**
   * 프롬프트 빌드 (정적 응답이므로 사용하지 않음)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }

  /**
   * FAQ 응답 생성
   */
  private getFAQResponse(intentName: string, brand?: string | null): string {
    const baseResponse = this.faqDatabase[intentName];

    if (!baseResponse) {
      return this.getGeneralHelpMessage(brand);
    }

    return this.addBrandContext(baseResponse, brand);
  }

  /**
   * 연락처 정보
   */
  private getContactInfo(): string {
    return `📞 **Kalron 고객센터 연락처**

🏢 **본사 정보:**
• 주소: 서울특별시 강남구 테헤란로 123
• 대표전화: 02-1234-5678
• 팩스: 02-1234-5679

💬 **고객지원:**
• LINE 채팅: 24시간 상담 가능
• 이메일: support@kalron.co.kr
• 카카오톡: @kalron_uniform

⏰ **상담 시간:**
• 평일: 09:00 ~ 18:00
• 토요일: 09:00 ~ 13:00
• 일요일/공휴일: 휴무

🚨 **긴급 문의:**
• 휴대폰: 010-1234-5678 (24시간)
• 긴급상황 시에만 이용해 주세요`;
  }

  /**
   * 영업시간 정보
   */
  private getBusinessHours(): string {
    return `⏰ **Kalron 영업시간 안내**

📅 **정규 영업시간:**
• 월~금요일: 09:00 ~ 18:00
• 토요일: 09:00 ~ 13:00
• 일요일/공휴일: 휴무

💬 **LINE 채팅 상담:**
• 24시간 자동 응답 시스템 운영
• 담당자 직접 상담: 영업시간 내

📞 **전화 상담:**
• 평일 09:00 ~ 18:00
• 점심시간 12:00 ~ 13:00 (상담 가능)

🏭 **제작 공장:**
• 월~토요일 운영
• 일요일: 휴무

⚡ **빠른 응답 시간:**
• LINE 채팅: 1분 이내
• 이메일: 2시간 이내 (영업시간)
• 전화: 즉시 연결`;
  }

  /**
   * 재질 정보
   */
  private getMaterialInfo(): string {
    return `🧵 **Kalron 유니폼 재질 정보**

⚾ **야구 유니폼 (ILB-MAX):**
• 메인 원단: 폴리에스터 100% 쿨맥스 소재
• 통기성: 우수 (속건성 기능)
• 신축성: 4-way 스트레치
• 특징: 항균, 방취 처리

⚽ **축구 유니폼 (MAX2MAX):**
• 메인 원단: 폴리에스터 92% + 스판덱스 8%
• 기능: DriFIT 기술 적용
• 통기성: 메쉬 패널 삽입
• 특징: 가벼움, 우수한 움직임

🏀 **농구 유니폼 (MAX2MAX):**
• 메인 원단: 폴리에스터 100% 메쉬
• 안감: 폴리에스터 쿨맥스
• 기능: 뛰어난 통기성
• 특징: 가볍고 시원함

🌟 **공통 특징:**
• 친환경 원단 사용
• 색상 변화 없음 (세탁 100회 테스트)
• KC 안전 인증 완료
• 국내 생산 (품질 보증)

💧 **관리 방법:**
• 찬물 세탁 권장
• 건조기 사용 금지
• 직사광선 건조 피하기`;
  }

  /**
   * 사이즈 가이드
   */
  private getSizeGuide(): string {
    return `📏 **Kalron 유니폼 사이즈 가이드**

👕 **상의 사이즈 (가슴둘레 기준):**
• XS: 88-92cm
• S: 92-96cm
• M: 96-100cm
• L: 100-104cm
• XL: 104-108cm
• XXL: 108-112cm
• 3XL: 112-116cm

👖 **하의 사이즈 (허리둘레 기준):**
• XS: 70-74cm
• S: 74-78cm
• M: 78-82cm
• L: 82-86cm
• XL: 86-90cm
• XXL: 90-94cm
• 3XL: 94-98cm

📐 **사이즈 측정 방법:**
• 가슴둘레: 겨드랑이 아래 가장 넓은 부분
• 허리둘레: 배꼽 위 가장 좁은 부분
• 편안한 상태에서 측정

🎯 **사이즈 선택 팁:**
• 여유있는 핏 선호: +1 사이즈
• 타이트한 핏 선호: 정사이즈
• 성장기 학생: +1~2 사이즈 권장

📦 **무료 샘플 서비스:**
• 사이즈 확인용 샘플 제공
• 신청 후 2-3일 내 발송
• 7일 내 반송 (무료)

❓ **사이즈 문의:**
LINE 채팅으로 개별 상담 가능`;
  }

  /**
   * 배송 정책
   */
  private getShippingPolicy(): string {
    return `🚚 **Kalron 배송 정책 안내**

📦 **배송 방법:**
• 일반 배송: 택배 (2-3일)
• 빠른 배송: 익일 배송 (추가 비용)
• 직접 수령: 본사 방문 수령 가능

💰 **배송비:**
• 50벌 이상: 무료 배송
• 50벌 미만: 3,000원
• 제주/도서 지역: +3,000원

⏰ **배송 기간:**
• 디자인 확정 후 제작 시작
• 제작 기간: 7~10일 (평균)
• 배송 기간: 2~3일 (택배)

📍 **배송 지역:**
• 전국 배송 가능
• 제주도, 울릉도 등 도서 지역 포함
• 해외 배송: 별도 문의

📋 **배송 준비:**
• 정확한 주소 확인 필수
• 연락처 변경 시 즉시 알려주세요
• 부재 시 배송 보관함 이용 가능

🔍 **배송 조회:**
• 발송 시 운송장 번호 제공
• LINE 채팅으로 실시간 조회
• 배송 완료 시 알림 발송

⚠️ **주의사항:**
• 제작 중 주소 변경 불가
• 배송 완료 후 7일 이내 확인 요청`;
  }

  /**
   * 환불 정책
   */
  private getRefundPolicy(): string {
    return `💰 **Kalron 환불/교환 정책**

✅ **환불 가능 조건:**
• 제작 전 주문 취소: 100% 환불
• 업체 사유 지연: 100% 환불 + 배상
• 품질 불량: 100% 환불 또는 재제작

❌ **환불 불가 조건:**
• 제작 완료 후 단순 변심
• 고객 요청 사항과 일치하는 경우
• 시즌 종료 후 환불 요청

📅 **환불 기간:**
• 계약 해지: 즉시 처리
• 품질 불량: 확인 후 3일 이내
• 지연 배상: 지연 확정 시 즉시

💳 **환불 방법:**
• 계좌 이체: 3-5일 소요
• 카드 취소: 3-7일 소요 (카드사별 상이)
• 현금 결제: 당일 처리 가능

🔄 **교환 서비스:**
• 사이즈 오류: 무료 교환
• 디자인 수정: 1회 무료 (이후 유료)
• 배송 사고: 즉시 재발송

📞 **환불 신청:**
• LINE 채팅으로 신청
• 사유 및 증빙 자료 제출
• 담당자 확인 후 처리

⚖️ **분쟁 해결:**
• 고객센터 1차 조정
• 소비자 분쟁 조정 위원회 연계
• 공정거래위원회 신고 가능

🛡️ **품질 보증:**
• 제작 오류: 무조건 재제작
• 내구성 문제: 6개월 A/S
• 색상 변화: 1년 보증`;
  }

  /**
   * 일반 도움말 메시지
   */
  private getGeneralHelpMessage(brand?: string | null): string {
    const brandName = brand === 'ILB_MAX' ? 'ILB-MAX' : brand === 'MAX2MAX' ? 'MAX2MAX' : 'Kalron';

    return `안녕하세요! ${brandName} 고객지원팀입니다. 😊

🤔 **무엇을 도와드릴까요?**

📞 **연락처 문의** - 전화번호, 주소 등
⏰ **영업시간 문의** - 상담 가능 시간
🧵 **재질 정보** - 원단, 기능성 소재
📏 **사이즈 가이드** - 정확한 사이즈 선택
🚚 **배송 정책** - 배송비, 기간, 지역
💰 **환불 정책** - 취소, 교환, 환불 규정

💬 **더 자세한 문의는:**
"연락처 알려주세요", "영업시간이 어떻게 되나요?" 등으로 말씀해 주시면 정확한 정보를 안내드립니다!`;
  }

  /**
   * 브랜드 컨텍스트 추가
   */
  private addBrandContext(baseResponse: string, brand?: string | null): string {
    if (!brand) {
      return baseResponse;
    }

    const brandInfo = brand === 'ILB_MAX'
      ? '\n\n⚾ **ILB-MAX 야구 전문** 브랜드입니다.'
      : brand === 'MAX2MAX'
        ? '\n\n⚽🏀 **MAX2MAX 축구/농구 전문** 브랜드입니다.'
        : '';

    return baseResponse + brandInfo;
  }

  /**
   * FAQ 카테고리 결정
   */
  private getFAQCategory(intentName: string): string {
    if (intentName.includes('contact')) {
      return 'contact';
    }
    if (intentName.includes('business') || intentName.includes('hours')) {
      return 'hours';
    }
    if (intentName.includes('material')) {
      return 'material';
    }
    if (intentName.includes('size')) {
      return 'size';
    }
    if (intentName.includes('shipping') || intentName.includes('delivery')) {
      return 'shipping';
    }
    if (intentName.includes('refund') || intentName.includes('cancel')) {
      return 'refund';
    }
    return 'general';
  }
}