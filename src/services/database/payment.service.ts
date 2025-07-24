import {
  Payment,
  Prisma,
  PaymentStatus,
  OrderClassification
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';
import { addMonths, endOfMonth } from 'date-fns';

/**
 * 결제 관련 데이터베이스 작업을 처리하는 서비스
 */
export class PaymentService extends BaseService<
  Payment,
  Prisma.PaymentCreateInput,
  Prisma.PaymentUpdateInput,
  Prisma.PaymentWhereInput,
  Prisma.PaymentWhereUniqueInput,
  Prisma.PaymentOrderByWithRelationInput
> {
  protected model = prisma.payment;
  protected modelName = 'Payment';

  /**
   * 주문번호로 결제 조회
   */
  async findByOrderNumber(orderNumber: string): Promise<Payment | null> {
    try {
      return await this.model.findUnique({
        where: { orderNumber }
      });
    } catch (error) {
      logger.error('Failed to find payment by order number', { orderNumber, error });
      throw error;
    }
  }

  /**
   * 고객의 모든 결제 내역 조회
   */
  async findByCustomerId(
    customerId: string,
    status?: PaymentStatus
  ): Promise<Payment[]> {
    try {
      return await this.model.findMany({
        where: {
          customerId,
          ...(status && { paymentStatus: status })
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error('Failed to find payments by customer', { customerId, status, error });
      throw error;
    }
  }

  /**
   * 주문 시간 업데이트 (1st ~ 5th)
   */
  async updateOrderTime(
    orderNumber: string,
    orderSequence: number,
    orderTime: Date
  ): Promise<Payment | null> {
    try {
      const payment = await this.findByOrderNumber(orderNumber);
      if (!payment) {
        return null;
      }

      const fieldMap: Record<number, keyof Payment> = {
        1: 'firstOrderTime',
        2: 'secondOrderTime',
        3: 'thirdOrderTime',
        4: 'fourthOrderTime',
        5: 'fifthOrderTime'
      };

      const field = fieldMap[orderSequence];
      if (!field) {
        return payment;
      }

      return await this.update({ id: payment.id }, {
        [field]: orderTime
      });
    } catch (error) {
      logger.error('Failed to update order time', {
        orderNumber,
        orderSequence,
        error
      });
      throw error;
    }
  }

  /**
   * 주문 간격 자동 계산 및 업데이트
   */
  async calculateOrderIntervals(paymentId: string): Promise<Payment | null> {
    try {
      const payment = await this.model.findUnique({ where: { id: paymentId } });
      if (!payment) {
        return null;
      }

      const updates: Prisma.PaymentUpdateInput = {};

      // 1st - 2nd 간격
      if (payment.firstOrderTime && payment.secondOrderTime) {
        updates.firstSecondInterval = Math.floor(
          (payment.secondOrderTime.getTime() - payment.firstOrderTime.getTime()) /
          (1000 * 60 * 60 * 24)
        );
      }

      // 2nd - 3rd 간격
      if (payment.secondOrderTime && payment.thirdOrderTime) {
        updates.secondThirdInterval = Math.floor(
          (payment.thirdOrderTime.getTime() - payment.secondOrderTime.getTime()) /
          (1000 * 60 * 60 * 24)
        );
      }

      // 3rd - 4th 간격
      if (payment.thirdOrderTime && payment.fourthOrderTime) {
        updates.thirdFourthInterval = Math.floor(
          (payment.fourthOrderTime.getTime() - payment.thirdOrderTime.getTime()) /
          (1000 * 60 * 60 * 24)
        );
      }

      // 4th - 5th 간격
      if (payment.fourthOrderTime && payment.fifthOrderTime) {
        updates.fourthFifthInterval = Math.floor(
          (payment.fifthOrderTime.getTime() - payment.fourthOrderTime.getTime()) /
          (1000 * 60 * 60 * 24)
        );
      }

      if (Object.keys(updates).length > 0) {
        return await this.update({ id: paymentId }, updates);
      }

      return payment;
    } catch (error) {
      logger.error('Failed to calculate order intervals', { paymentId, error });
      throw error;
    }
  }

  /**
   * 주문 분류 자동 판별
   */
  async determineOrderClassification(
    productCategory: string,
    sportType?: string
  ): Promise<OrderClassification> {
    // 샘플&디자인 체크
    if (productCategory.includes('샘플&디자인')) {
      return OrderClassification.SAMPLE_DESIGN;
    }

    // 야구 체크
    if (productCategory.includes('야구')) {
      if (productCategory.includes('신규')) {
        return OrderClassification.NEW_BASEBALL;
      }
      if (productCategory.includes('기존')) {
        return OrderClassification.EXISTING_BASEBALL;
      }
    }

    // 축구 체크 (sportType 활용)
    if (sportType === 'SOCCER') {
      if (productCategory.includes('신규')) {
        return OrderClassification.NEW_SOCCER;
      }
      if (productCategory.includes('기존')) {
        return OrderClassification.EXISTING_SOCCER;
      }
    }

    // 기본값
    return OrderClassification.NEW_BASEBALL;
  }

  /**
   * 샘플 환불 기한 계산
   */
  async calculateSampleRefundDeadline(
    sampleSentDate: Date
  ): Promise<Date> {
    // 익월 월말 계산
    return endOfMonth(addMonths(sampleSentDate, 1));
  }

  /**
   * 결제 상태 업데이트
   */
  async updatePaymentStatus(
    orderNumber: string,
    status: PaymentStatus,
    completeDate?: Date
  ): Promise<Payment | null> {
    try {
      const payment = await this.findByOrderNumber(orderNumber);
      if (!payment) {
        return null;
      }

      const updates: Prisma.PaymentUpdateInput = {
        paymentStatus: status
      };

      if (status === PaymentStatus.COMPLETED && completeDate) {
        updates.paymentCompleteDate = completeDate;
      }

      return await this.update({ id: payment.id }, updates);
    } catch (error) {
      logger.error('Failed to update payment status', {
        orderNumber,
        status,
        error
      });
      throw error;
    }
  }

  /**
   * 주문 통계 조회
   */
  async getOrderStats(customerId: string): Promise<{
    totalOrders: number;
    completedOrders: number;
    totalAmount: number;
    averageOrderValue: number;
  }> {
    try {
      const payments = await this.findByCustomerId(customerId);

      const completedPayments = payments.filter(
        p => p.paymentStatus === PaymentStatus.COMPLETED
      );

      const totalAmount = completedPayments.reduce(
        (sum, p) => sum + p.actualPaymentAmount,
        0
      );

      return {
        totalOrders: payments.length,
        completedOrders: completedPayments.length,
        totalAmount,
        averageOrderValue: completedPayments.length > 0
          ? totalAmount / completedPayments.length
          : 0
      };
    } catch (error) {
      logger.error('Failed to get order stats', { customerId, error });
      throw error;
    }
  }
}

export const paymentService = new PaymentService();