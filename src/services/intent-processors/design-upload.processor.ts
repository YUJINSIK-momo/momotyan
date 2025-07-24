import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import logger from '../../utils/logger';

/**
 * 디자인 파일 업로드 처리 프로세서
 * - 고객이 기존 디자인을 가지고 있는 경우
 * - Slack 채널로 전달하여 디자이너 검토
 */
export class DesignUploadProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    try {
      const hasAttachment = this.checkForAttachment(context.message);
      const message = this.getDesignUploadResponse(hasAttachment, context.customer?.brand);

      logger.info('Design upload request processed', {
        userId: context.userId,
        hasAttachment,
        brand: context.customer?.brand
      });

      return {
        success: true,
        message,
        metadata: {
          requiresApproval: hasAttachment, // 첨부파일 있으면 승인 필요
          automationLevel: hasAttachment ? 30 : 90,
          responseType: 'design_upload',
          hasAttachment,
          nextAction: hasAttachment ? 'designer_review' : 'upload_instruction'
        }
      };

    } catch (error) {
      logger.error('Error in DesignUploadProcessor', {
        error,
        userId: context.userId,
        intent: context.intent.intentName
      });

      return {
        success: false,
        message: '죄송합니다. 디자인 업로드 처리 중 오류가 발생했습니다. 담당자에게 연결해 드리겠습니다.',
        metadata: { requiresApproval: true }
      };
    }
  }

  /**
   * 컨텍스트 수집
   */
  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    return {
      responseType: 'design_upload_guidance',
      hasCustomerInfo: !!context.customer,
      brand: context.customer?.brand,
      teamName: context.customer?.teamName,
      hasAttachment: this.checkForAttachment(context.message)
    };
  }

  /**
   * 프롬프트 빌드 (정적 응답이므로 사용하지 않음)
   */
  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>): string {
    return '';
  }

  /**
   * 첨부파일 여부 확인
   */
  private checkForAttachment(message: string): boolean {
    // LINE에서 이미지나 파일이 포함된 경우를 감지
    // 실제로는 LINE 메시지 타입을 확인해야 하지만, 여기서는 간단하게 처리
    const fileKeywords = ['이미지', '파일', '사진', '그림', '디자인', '첨부'];
    return fileKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * 디자인 업로드 응답 생성
   */
  private getDesignUploadResponse(hasAttachment: boolean, brand?: string | null): string {
    if (hasAttachment) {
      return this.getAttachmentReceivedMessage(brand);
    } else {
      return this.getUploadInstructionMessage(brand);
    }
  }

  /**
   * 첨부파일 수신 메시지
   */
  private getAttachmentReceivedMessage(brand?: string | null): string {
    const brandName = this.getBrandName(brand);

    return `📁 **디자인 파일 수신 완료!**

${brandName} 디자이너가 고객님의 디자인을 검토하고 있습니다.

🔍 **검토 과정:**
• 디자인 실현 가능성 확인
• 제작 방법 및 비용 산정
• 개선 제안사항 검토
• 최종 견적 산출

⏰ **예상 소요시간:**
• 기본 검토: 1-2시간
• 복잡한 디자인: 반나절
• 대폭 수정 필요시: 1일

💬 **검토 완료 후:**
• 실현 가능성 및 예상 비용 안내
• 필요시 수정 제안
• 최종 견적서 발송

🎯 **참고사항:**
• 해상도가 낮은 경우 다시 업로드 요청드릴 수 있습니다
• 저작권 문제가 있는 디자인은 수정이 필요할 수 있습니다
• 제작 난이도에 따라 추가 비용이 발생할 수 있습니다

잠시만 기다려 주시면 전문 디자이너가 상세한 검토 결과를 안내드리겠습니다! 😊`;
  }

  /**
   * 업로드 안내 메시지
   */
  private getUploadInstructionMessage(brand?: string | null): string {
    const brandName = this.getBrandName(brand);

    return `📎 **${brandName} 디자인 업로드 안내**

기존에 만들어진 디자인이 있으시군요! 👍

📸 **업로드 방법:**
1. 디자인 파일을 이 채팅창에 첨부해 주세요
2. 지원 형식: JPG, PNG, PDF, AI, PSD
3. 해상도: 300dpi 이상 권장

📋 **필요한 정보도 함께 알려주세요:**
• 어떤 부분을 수정하고 싶으신지
• 색상 변경 희망사항
• 특별한 요청사항

💡 **업로드 팁:**
• 고화질일수록 정확한 검토 가능
• 여러 각도나 버전이 있다면 모두 전송
• 참고 자료도 함께 보내주시면 도움됩니다

⚠️ **주의사항:**
• 저작권이 있는 로고나 캐릭터는 별도 확인 필요
• 타 업체 제작물의 경우 수정 제작만 가능
• 너무 복잡한 디자인은 단순화 제안드릴 수 있습니다

🎯 **빠른 진행:**
파일을 첨부해 주시면 즉시 전문 디자이너가 검토를 시작합니다!

📞 **문의사항:**
업로드 관련 문제가 있으시면 "도움말"이라고 말씀해 주세요.`;
  }

  /**
   * 브랜드명 반환
   */
  private getBrandName(brand?: string | null): string {
    switch (brand) {
    case 'ILB_MAX':
      return 'ILB-MAX';
    case 'MAX2MAX':
      return 'MAX2MAX';
    default:
      return 'Kalron';
    }
  }
}