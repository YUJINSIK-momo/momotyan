import { BaseIntentProcessor } from './base.processor';
import { ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService, paymentService } from '../database';
import logger from '../../utils/logger';

/**
 * 결제 관련 문의 처리 프로세서
 * 다양한 결제 관련 인텐트를 통합 처리
 */
export class PaymentInquiryProcessor extends BaseIntentProcessor {
  // 결제 관련 인텐트 패턴 매핑
  private readonly intentPatterns: Record<string, (context: ProcessorContext) => Promise<ProcessorResponse>> = {
    // 결제 방식 관련
    '결제_50_100_차이_문의': this.handle50vs100Payment.bind(this),
    '결제_50_희망_문의': this.handle50PaymentRequest.bind(this),
    '결제_계좌송금_수수료_문의': this.handleTransferFeeInquiry.bind(this),
    '결제_법인계좌_송금_문의': this.handleCorporateTransfer.bind(this),

    // 영수증 관련
    '결제_영수증_발급_CS_문의': this.handleReceiptIssue.bind(this),
    '결제_영수증_재발급_CS_문의': this.handleReceiptReissue.bind(this),
    '결제_영수증_분리_문의': this.handleReceiptSplit.bind(this),
    '결제_영수증_용도변경_문의': this.handleReceiptPurposeChange.bind(this),

    // CS 관련
    '결제_UI_에러_CS_문의': this.handleUIError.bind(this),
    '결제_실패_CS_문의': this.handlePaymentFailure.bind(this),
    '결제_기한_연기_CS_문의': this.handlePaymentExtension.bind(this),

    // 기타
    '결제_명의_다른_문의': this.handleDifferentNamePayment.bind(this),
    '결제_송금처_문의': this.handleTransferDestination.bind(this)
  };

  // 결제 문의 인텐트 처리 메인 메서드
  // 인텐트 패턴에 따라 적절한 핸들러로 라우팅
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    const { intent } = context;

    // 인텐트명에서 기본 패턴 추출
    const basePattern = this.extractBasePattern(intent.intentName);
    const handler = this.intentPatterns[basePattern];

    if (handler) {
      return handler(context);
    }

    // 매핑되지 않은 인텐트는 기본 처리
    return this.baseProcess(context);
  }

  // 인텐트명에서 기본 패턴 추출
  // 변형 접미사와 숫자를 제거하여 핵심 패턴만 추출
  private extractBasePattern(intentName: string): string {
    // '_변형' 제거 및 기본 패턴 추출
    return intentName.replace(/_변형$/, '').replace(/\d+$/, '');
  }

  // 50% vs 100% 결제 차이 설명
  // 고객이 선금과 전액 결제의 차이점을 문의할 때 사용
  private async handle50vs100Payment(_context: ProcessorContext): Promise<ProcessorResponse> {
    const template = `50% 선금과 100% 결제의 차이점을 설명드립니다:

📌 **50% 선금 결제**
- 주문 확정 시 50% 결제
- 제작 완료 후 나머지 50% 결제
- 일반적인 결제 방식

📌 **100% 선결제**
- 주문 확정 시 전액 결제
- 5-10% 할인 혜택 제공
- 대량 주문 시 추천

어떤 방식을 선택하시겠습니까?`;

    return {
      success: true,
      message: template,
      metadata: {
        source: 'template' as const,
        processingTime: 0
      }
    };
  }

  // 50% 선금 결제 희망 처리
  // 고객이 50% 선금 결제를 희망할 때 고객 타입에 따라 다른 응답 제공
  private async handle50PaymentRequest(context: ProcessorContext): Promise<ProcessorResponse> {
    const customer = await this.getCustomerInfo(context.userId);

    const response = customer?.customerType === 'EXISTING'
      ? '네, 기존 고객님은 50% 선금 결제가 가능합니다. 주문서를 보내드리겠습니다.'
      : '네, 50% 선금 결제로 진행 가능합니다. 주문 정보를 확인해 주세요.';

    return {
      success: true,
      message: response,
      metadata: {
        source: 'template' as const,
        processingTime: 0
      }
    };
  }

  // 계좌 송금 수수료 문의 처리
  // 송금 시 수수료 부담 주체에 대한 안내
  private async handleTransferFeeInquiry(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '계좌 송금 시 수수료는 고객님 부담입니다. 송금 수수료를 포함하여 정확한 금액을 입금해 주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 법인 계좌 송금 문의 처리
  // 법인 계좌로의 송금 가능 여부 및 세금계산서 발행 안내
  private async handleCorporateTransfer(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '법인 계좌로 송금 가능합니다. 세금계산서 발행을 원하시면 사업자등록증을 보내주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 영수증 발급 문의 처리
  // 고객 정보를 수집하여 LLM을 통한 맞춤형 응답 생성
  private async handleReceiptIssue(context: ProcessorContext): Promise<ProcessorResponse> {
    const gatheredData = await this.gatherContext(context);
    const prompt = this.buildPrompt(context, gatheredData);

    // LLM으로 맞춤형 응답 생성
    // 고객의 상황에 맞는 영수증 발급 안내를 위해 LLM 서비스 활용
    const llmService = new (await import('../llm')).LLMService();
    const llmResponse = await llmService.generateResponse(prompt, {});

    return {
      success: true,
      message: llmResponse.content || '죄송합니다. 응답을 생성할 수 없습니다.',
      metadata: {
        source: 'llm' as const,
        processingTime: 0,
        tokens: llmResponse.usage?.totalTokens
      }
    };
  }

  // 영수증 재발급 문의 처리
  // 영수증 재발급을 위해 필요한 정보 안내
  private async handleReceiptReissue(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '영수증 재발급을 도와드리겠습니다. 주문번호와 결제자명을 알려주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 영수증 분리 발급 문의 처리
  // 영수증을 여러 용도로 분리하여 발급하는 방법 안내
  private async handleReceiptSplit(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '영수증 분리 발급이 가능합니다. 분리하실 금액과 각각의 용도를 알려주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 영수증 용도 변경 문의 처리
  // 이미 발급된 영수증의 용도 변경 가능 여부 및 기한 안내
  private async handleReceiptPurposeChange(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '영수증 용도 변경은 발급 후 7일 이내 가능합니다. 변경하실 용도를 알려주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 결제 UI 에러 처리
  // 결제 페이지에서 발생하는 오류에 대한 대안책 제시
  private async handleUIError(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '결제 페이지 오류로 불편을 드려 죄송합니다. 다른 브라우저를 이용하시거나, 계좌 송금으로 결제 부탁드립니다.',
      metadata: {
        source: 'static' as const,
        processingTime: 0 // Slack으로 에스컬레이션
      }
    };
  }

  // 결제 실패 문의 처리
  // 결제가 실패했을 때의 원인 분석 및 대안 결제 수단 안내
  private async handlePaymentFailure(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '결제 실패로 불편을 드려 죄송합니다. 카드사에 문의하시거나 다른 결제 수단을 이용해 주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 결제 기한 연기 문의 처리
  // 고객 타입에 따라 결제 기한 연기 가능 여부 결정
  private async handlePaymentExtension(context: ProcessorContext): Promise<ProcessorResponse> {
    const customer = await this.getCustomerInfo(context.userId);

    if (customer?.customerType === 'EXISTING') {
      return {
        success: true,
        message: '결제 기한 연기를 검토해드리겠습니다. 희망하시는 결제일을 알려주세요.',
        metadata: {
          source: 'template' as const,
          processingTime: 0
        }
      };
    }

    return {
      success: true,
      message: '죄송하지만 결제 기한 연기는 어렵습니다. 주문 취소 후 재주문을 고려해 주세요.',
      metadata: {
        source: 'template' as const,
        processingTime: 0
      }
    };
  }

  // 다른 명의 결제 문의 처리
  // 주문자와 다른 명의로 결제할 때의 절차 안내
  private async handleDifferentNamePayment(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: '다른 명의로 결제 가능합니다. 결제자 정보를 주문서에 정확히 기재해 주세요.',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 송금 계좌 정보 문의 처리
  // 계좌 송금을 위한 은행 정보 및 입금 방법 안내
  private async handleTransferDestination(_context: ProcessorContext): Promise<ProcessorResponse> {
    return {
      success: true,
      message: `계좌 정보 안내드립니다:
      
은행: 신한은행
계좌번호: 110-123-456789
예금주: (주)칼론스포츠

입금 시 주문자명으로 입금 부탁드립니다.`,
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  // 결제 관련 컨텍스트 수집
  // 고객 정보와 최근 결제 이력을 수집하여 개인화된 응답 생성에 활용
  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const { userId } = context;

    try {
      const customer = await customerService.findByLineUserId(userId);
      const recentPayments = customer
        ? await paymentService.findByCustomerId(customer.id)
        : [];

      return {
        customerName: customer?.lineUserName || '고객님',
        customerType: customer?.customerType,
        hasRecentOrder: recentPayments.length > 0,
        lastOrderDate: recentPayments[0]?.createdAt
      };
    } catch (error) {
      logger.error('Failed to gather payment context', { error });
      return {};
    }
  }

  // LLM을 위한 프롬프트 생성
  // 수집된 고객 컨텍스트를 활용하여 개인화된 응답을 위한 프롬프트 구성
  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { message, intent } = context;
    const { customerName, hasRecentOrder } = gatheredData;

    return `고객이 결제 관련 문의를 하고 있습니다.

인텐트: ${intent.intentName}
고객명: ${customerName}
기존 주문 여부: ${hasRecentOrder ? '있음' : '없음'}
문의 내용: ${message}

친절하고 정확한 답변을 한국어로 작성해주세요.`;
  }

  // 고객 정보 조회 헬퍼 메서드
  // 안전한 고객 정보 조회를 위한 에러 처리 포함
  private async getCustomerInfo(userId: string) {
    try {
      return await customerService.findByLineUserId(userId);
    } catch (error) {
      logger.error('Failed to get customer info', { error });
      return null;
    }
  }
}

export const paymentInquiryProcessor = new PaymentInquiryProcessor();