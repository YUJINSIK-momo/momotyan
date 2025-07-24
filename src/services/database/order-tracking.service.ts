import {
  OrderTracking,
  Prisma,
  OrderType,
  OrderStatus
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

export class OrderTrackingService extends BaseService<
  OrderTracking,
  Prisma.OrderTrackingCreateInput,
  Prisma.OrderTrackingUpdateInput,
  Prisma.OrderTrackingWhereInput,
  Prisma.OrderTrackingWhereUniqueInput,
  Prisma.OrderTrackingOrderByWithRelationInput
> {
  protected model = prisma.orderTracking;
  protected modelName = 'OrderTracking';

  /**
   * 고객의 주문 추적 정보 조회
   */
  async findByCustomerId(customerId: string, options?: {
    orderType?: OrderType;
    status?: OrderStatus;
    limit?: number;
  }) {
    const where: Prisma.OrderTrackingWhereInput = { customerId };

    if (options?.orderType) {
      where.orderType = options.orderType;
    }

    if (options?.status) {
      where.status = options.status;
    }

    return this.findMany(where, {
      orderBy: { createdAt: 'desc' },
      limit: options?.limit
    });
  }

  /**
   * 활성 주문 조회
   */
  async getActiveOrders(customerId: string) {
    return this.findMany({
      customerId,
      status: {
        notIn: [OrderStatus.DELIVERED, OrderStatus.SHIPPED]
      }
    }, {
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 주문 상태 업데이트
   */
  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    additionalData?: {
      trackingNumber?: string;
      orderSheetUrl?: string;
      quoteUrl?: string;
      paymentUrl?: string;
    }
  ) {
    const updateData: Prisma.OrderTrackingUpdateInput = {
      status: newStatus,
      ...additionalData
    };

    const updated = await this.update({ id: orderId }, updateData);

    if (updated) {
      logger.info('Order status updated', {
        orderId,
        oldStatus: updated.status,
        newStatus,
        customerId: updated.customerId
      });
    }

    return updated;
  }

  /**
   * 팀별 주문 통계
   */
  async getTeamOrderStats(teamName: string) {
    const orders = await this.findMany({ teamName });

    const stats = {
      totalOrders: orders.length,
      newOrders: orders.filter(o => o.orderType === OrderType.NEW_ORDER).length,
      additionalOrders: orders.filter(o => o.orderType === OrderType.ADDITIONAL_ORDER).length,
      statusDistribution: {} as Record<OrderStatus, number>
    };

    // 상태별 분포
    Object.values(OrderStatus).forEach(status => {
      stats.statusDistribution[status] = orders.filter(o => o.status === status).length;
    });

    return stats;
  }

  /**
   * 배송 예정 주문 조회
   */
  async getOrdersReadyForShipping() {
    return this.findMany({
      status: OrderStatus.PRODUCTION_COMPLETE,
      trackingNumber: null
    }, {
      orderBy: { updatedAt: 'asc' }
    });
  }
}

export const orderTrackingService = new OrderTrackingService();