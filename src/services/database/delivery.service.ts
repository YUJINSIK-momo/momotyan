import {
  Delivery,
  Prisma
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';
import { addWeeks, addDays } from 'date-fns';

/**
 * 배송 관련 데이터베이스 작업을 처리하는 서비스
 */
export class DeliveryService extends BaseService<
  Delivery,
  Prisma.DeliveryCreateInput,
  Prisma.DeliveryUpdateInput,
  Prisma.DeliveryWhereInput,
  Prisma.DeliveryWhereUniqueInput,
  Prisma.DeliveryOrderByWithRelationInput
> {
  protected model = prisma.delivery;
  protected modelName = 'Delivery';

  /**
   * 주문번호로 배송 정보 조회
   */
  async findByOrderNumber(orderNumber: string): Promise<Delivery | null> {
    try {
      return await this.model.findFirst({
        where: { orderNumber }
      });
    } catch (error) {
      logger.error('Failed to find delivery by order number', { orderNumber, error });
      throw error;
    }
  }

  /**
   * 고객의 모든 배송 내역 조회
   */
  async findByCustomerId(customerId: string): Promise<Delivery[]> {
    try {
      return await this.model.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error('Failed to find deliveries by customer', { customerId, error });
      throw error;
    }
  }

  /**
   * 예상 납기 계산
   * 일반 발송: 5주
   * EXPRESS: 4주
   */
  async calculateEstimatedDeliveryDate(
    orderNumber: string,
    processingStartDate: Date,
    itemName: string
  ): Promise<{ isExpress: boolean; estimatedDate: Date }> {
    try {
      // EXPRESS 여부 판단
      const isExpress = itemName.includes('우선제작') || itemName.includes('EXPRESS');
      const weeksToAdd = isExpress ? 4 : 5;
      const estimatedDate = addWeeks(processingStartDate, weeksToAdd);

      // 배송 정보 업데이트 또는 생성
      const existing = await this.findByOrderNumber(orderNumber);

      if (existing) {
        await this.update({ id: existing.id }, {
          isExpress,
          estimatedDeliveryDate: estimatedDate
        });
      }

      return { isExpress, estimatedDate };
    } catch (error) {
      logger.error('Failed to calculate estimated delivery date', {
        orderNumber,
        itemName,
        error
      });
      throw error;
    }
  }

  /**
   * 실제 납기 계산
   * 완료 상태 변경일 + 4일
   */
  async calculateActualDeliveryDate(
    orderNumber: string,
    completionDate: Date
  ): Promise<Date> {
    try {
      const actualDate = addDays(completionDate, 4);

      const existing = await this.findByOrderNumber(orderNumber);
      if (existing) {
        await this.update({ id: existing.id }, {
          actualDeliveryDate: actualDate
        });
      }

      return actualDate;
    } catch (error) {
      logger.error('Failed to calculate actual delivery date', {
        orderNumber,
        completionDate,
        error
      });
      throw error;
    }
  }

  /**
   * 배송 정보 생성 또는 업데이트
   */
  async upsertDelivery(
    customerId: string,
    orderNumber: string,
    deliveryData: {
      isExpress?: boolean;
      estimatedDeliveryDate?: Date;
      actualDeliveryDate?: Date;
      trackingNumber?: string;
    }
  ): Promise<Delivery> {
    try {
      const existing = await this.findByOrderNumber(orderNumber);

      if (existing) {
        return await this.update({ id: existing.id }, deliveryData);
      } else {
        return await this.create({
          customer: { connect: { id: customerId } },
          orderNumber,
          ...deliveryData
        });
      }
    } catch (error) {
      logger.error('Failed to upsert delivery', {
        customerId,
        orderNumber,
        deliveryData,
        error
      });
      throw error;
    }
  }

  /**
   * 트래킹 번호 업데이트
   */
  async updateTrackingNumber(
    orderNumber: string,
    trackingNumber: string
  ): Promise<Delivery | null> {
    try {
      const delivery = await this.findByOrderNumber(orderNumber);
      if (!delivery) {
        return null;
      }

      return await this.update({ id: delivery.id }, { trackingNumber });
    } catch (error) {
      logger.error('Failed to update tracking number', {
        orderNumber,
        trackingNumber,
        error
      });
      throw error;
    }
  }

  /**
   * 진행 중인 배송 조회
   */
  async findPendingDeliveries(): Promise<Delivery[]> {
    try {
      return await this.model.findMany({
        where: {
          actualDeliveryDate: null,
          estimatedDeliveryDate: { not: null }
        },
        include: {
          customer: true
        },
        orderBy: { estimatedDeliveryDate: 'asc' }
      });
    } catch (error) {
      logger.error('Failed to find pending deliveries', { error });
      throw error;
    }
  }

  /**
   * 배송 지연 여부 확인
   */
  async checkDeliveryDelay(orderNumber: string): Promise<{
    isDelayed: boolean;
    delayDays: number;
  } | null> {
    try {
      const delivery = await this.findByOrderNumber(orderNumber);
      if (!delivery || !delivery.estimatedDeliveryDate) {
        return null;
      }

      const now = new Date();
      const isDelayed = now > delivery.estimatedDeliveryDate && !delivery.actualDeliveryDate;
      const delayDays = isDelayed
        ? Math.floor((now.getTime() - delivery.estimatedDeliveryDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return { isDelayed, delayDays };
    } catch (error) {
      logger.error('Failed to check delivery delay', { orderNumber, error });
      throw error;
    }
  }
}

export const deliveryService = new DeliveryService();