import { BaseIntentProcessor } from './base.processor';
import { ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService, deliveryService, paymentService } from '../database';
import { PaymentStatus } from '../../generated/prisma';
import { ProductDetails } from '../../types/payment.types';
import { ActiveDeliveryInfo } from '../../types/delivery.types';
import logger from '../../utils/logger';
import { format } from 'date-fns';

export class DeliveryStatusProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    return this.baseProcess(context);
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const { userId } = context;

    try {
      // 고객 정보 조회
      const customer = await customerService.findByLineUserId(userId);

      if (!customer) {
        return { customerName: 'お客様' };
      }

      // 진행 중인 주문의 배송 정보 조회
      const completedPayments = await paymentService.findByCustomerId(
        customer.id,
        PaymentStatus.COMPLETED
      );

      const activeDeliveries: ActiveDeliveryInfo[] = [];

      for (const payment of completedPayments) {
        const delivery = await deliveryService.findByOrderNumber(payment.orderNumber);
        if (delivery && !delivery.actualDeliveryDate) {
          const delayInfo = await deliveryService.checkDeliveryDelay(payment.orderNumber);

          activeDeliveries.push({
            orderNumber: payment.orderNumber,
            productName: (payment.productDetails as ProductDetails)?.name || 'ユニフォーム',
            isExpress: delivery.isExpress,
            estimatedDate: delivery.estimatedDeliveryDate,
            trackingNumber: delivery.trackingNumber,
            isDelayed: delayInfo?.isDelayed || false,
            delayDays: delayInfo?.delayDays || 0
          });
        }
      }

      return {
        customerName: customer.lineUserName || 'お客様',
        teamName: customer.teamName,
        activeDeliveries,
        hasActiveDeliveries: activeDeliveries.length > 0
      };
    } catch (error) {
      logger.error('Failed to gather delivery context', { userId, error });
      return {
        customerName: 'お客様',
        hasActiveDeliveries: false
      };
    }
  }

  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { message } = context;
    const { customerName, teamName, activeDeliveries, hasActiveDeliveries } = gatheredData;

    let promptContext = '고객이 배송 상태를 문의하고 있습니다.\n\n';
    promptContext += '고객 정보:\n';
    promptContext += `- 이름: ${customerName}\n`;

    if (teamName) {
      promptContext += `- 팀명: ${teamName}\n`;
    }

    if (hasActiveDeliveries && Array.isArray(activeDeliveries)) {
      promptContext += '\n진행 중인 배송:\n';
      activeDeliveries.forEach((delivery, index) => {
        promptContext += `\n${index + 1}. 주문번호: ${delivery.orderNumber}\n`;
        promptContext += `   - 상품: ${delivery.productName}\n`;
        promptContext += `   - 배송 타입: ${delivery.isExpress ? 'EXPRESS (4주)' : '일반 (5주)'}\n`;
        promptContext += `   - 예상 배송일: ${format(new Date(delivery.estimatedDate), 'yyyy년 MM월 dd일')}\n`;

        if (delivery.trackingNumber) {
          promptContext += `   - 운송장 번호: ${delivery.trackingNumber}\n`;
        }

        if (delivery.isDelayed) {
          promptContext += `   - ⚠️ 지연: ${delivery.delayDays}일\n`;
        }
      });
    } else {
      promptContext += '\n현재 진행 중인 배송이 없습니다.\n';
    }

    promptContext += `\n고객 메시지: "${message}"\n\n`;
    promptContext += '응답 가이드라인:\n';
    promptContext += '1. 배송 상태를 명확하고 상세하게 안내\n';
    promptContext += '2. 예상 배송일을 구체적으로 알려줌\n';
    promptContext += '3. 운송장 번호가 있다면 함께 안내\n';
    promptContext += '4. 지연이 있다면 사과와 함께 새로운 예상일 안내\n';
    promptContext += '5. 추가 문의사항이 있으면 언제든 연락하라고 안내\n';
    promptContext += '6. 일본어로 응답\n';

    return promptContext;
  }

  protected async postProcess(response: string, context: ProcessorContext, _gatheredData: Record<string, unknown>): Promise<string> {
    // 배송 조회 이력 로깅
    try {
      const customer = await customerService.findByLineUserId(context.userId);
      if (customer) {
        logger.info('Delivery status checked', {
          customerId: customer.id,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Failed to log delivery status check', { error });
    }

    return response;
  }
}