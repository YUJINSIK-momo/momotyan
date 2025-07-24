import { BaseIntentProcessor } from './base.processor';
import { ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService, paymentService, deliveryService, customerJourneyService } from '../database';
import { PaymentStatus, CustomerJourneyStage } from '../../generated/prisma';
import { ProductDetails } from '../../types/payment.types';
import logger from '../../utils/logger';

export class PaymentCompleteProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    const result = await this.baseProcess(context);

    // 프로세서가 직접 조건부 Journey 업데이트를 처리하므로 skipJourneyUpdate 설정
    return {
      ...result,
      metadata: {
        ...result.metadata,
        skipJourneyUpdate: true
      }
    };
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const { userId } = context;

    try {
      // 고객 정보 조회
      const customer = await customerService.findByLineUserId(userId);

      // 최근 주문 정보 조회
      const recentPayments = customer ?
        await paymentService.findByCustomerId(customer.id, PaymentStatus.PENDING) : [];

      const latestPayment = recentPayments[0];

      return {
        customerName: customer?.lineUserName || 'お客様',
        teamName: customer?.teamName,
        hasRecentOrder: !!latestPayment,
        orderNumber: latestPayment?.orderNumber,
        productDetails: latestPayment?.productDetails
      };
    } catch (error) {
      logger.error('Failed to gather payment context', { userId, error });
      return {
        customerName: 'お客様'
      };
    }
  }

  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { message } = context;
    const { customerName, teamName, hasRecentOrder, orderNumber } = gatheredData;

    let promptContext = '고객이 결제 완료를 알리고 있습니다.\n\n';
    promptContext += '고객 정보:\n';
    promptContext += `- 이름: ${customerName}\n`;

    if (teamName) {
      promptContext += `- 팀명: ${teamName}\n`;
    }

    if (hasRecentOrder && orderNumber) {
      promptContext += `- 주문번호: ${orderNumber}\n`;
    }

    promptContext += `\n고객 메시지: "${message}"\n\n`;
    promptContext += '응답 가이드라인:\n';
    promptContext += '1. 결제 완료에 대해 감사 인사\n';
    promptContext += '2. 제작 프로세스가 시작됨을 안내\n';
    promptContext += '3. 예상 납기 재확인 (일반: 5주, EXPRESS: 4주)\n';
    promptContext += '4. 진행 상황을 수시로 안내하겠다고 약속\n';
    promptContext += '5. 문의사항이 있으면 언제든 연락하라고 안내\n';
    promptContext += '6. 일본어로 응답\n';

    return promptContext;
  }

  protected async postProcess(response: string, context: ProcessorContext, _gatheredData: Record<string, unknown>): Promise<string> {
    try {
      const customer = await customerService.findByLineUserId(context.userId);

      if (customer) {
        // 최근 주문 찾기
        const recentPayments = await paymentService.findByCustomerId(
          customer.id,
          PaymentStatus.PENDING
        );

        if (recentPayments.length > 0) {
          const payment = recentPayments[0];

          // 결제 상태 업데이트
          await paymentService.updatePaymentStatus(
            payment.orderNumber,
            PaymentStatus.COMPLETED,
            new Date()
          );

          // 주문 분류 결정 (productDetails에서 카테고리 추출)
          const productDetails = payment.productDetails as ProductDetails;
          const productCategory = productDetails?.category || '';
          const classification = await paymentService.determineOrderClassification(
            productCategory,
            customer.sportType || undefined
          );

          await paymentService.update({ id: payment.id }, {
            orderClassification: classification
          });

          // 배송 예정일 계산
          const itemName = productDetails?.name || productCategory;
          const deliveryInfo = await deliveryService.calculateEstimatedDeliveryDate(
            payment.orderNumber,
            new Date(),
            itemName
          );

          // 배송 정보 생성/업데이트
          await deliveryService.upsertDelivery(
            customer.id,
            payment.orderNumber,
            {
              isExpress: deliveryInfo.isExpress,
              estimatedDeliveryDate: deliveryInfo.estimatedDate
            }
          );

          // 여정 단계 업데이트
          await customerJourneyService.updateJourneyStage(
            context.userId,
            CustomerJourneyStage.PAYMENT_COMPLETED
          );

          logger.info('Payment completed and delivery scheduled', {
            customerId: customer.id,
            orderNumber: payment.orderNumber,
            estimatedDelivery: deliveryInfo.estimatedDate
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process payment completion', { error });
    }

    return response;
  }
}