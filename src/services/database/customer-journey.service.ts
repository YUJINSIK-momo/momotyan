import {
  CustomerJourney,
  Prisma,
  CustomerJourneyStage,
  ProgressStatus
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * 고객 여정 관련 데이터베이스 작업을 처리하는 서비스
 */
export class CustomerJourneyService extends BaseService<
  CustomerJourney,
  Prisma.CustomerJourneyCreateInput,
  Prisma.CustomerJourneyUpdateInput,
  Prisma.CustomerJourneyWhereInput,
  Prisma.CustomerJourneyWhereUniqueInput,
  Prisma.CustomerJourneyOrderByWithRelationInput
> {
  protected model = prisma.customerJourney;
  protected modelName = 'CustomerJourney';

  /**
   * 고객의 현재 활성 여정 조회
   */
  async findActiveJourney(customerId: string): Promise<CustomerJourney | null> {
    try {
      return await this.model.findFirst({
        where: {
          customerId,
          progressStatus: ProgressStatus.IN_PROGRESS
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error('Failed to find active journey', { customerId, error });
      throw error;
    }
  }

  /**
   * 여정 단계 업데이트
   */
  async updateJourneyStage(
    customerId: string,
    stage: CustomerJourneyStage
  ): Promise<CustomerJourney> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (activeJourney) {
        return await this.update({ id: activeJourney.id }, {
          journeyStage: stage
        });
      } else {
        // 새로운 여정 생성
        return await this.create({
          customer: { connect: { id: customerId } },
          progressStatus: ProgressStatus.IN_PROGRESS,
          journeyStage: stage
        });
      }
    } catch (error) {
      logger.error('Failed to update journey stage', { customerId, stage, error });
      throw error;
    }
  }

  /**
   * 트래킹 카운트 증가
   */
  async incrementTrackingCount(customerId: string): Promise<CustomerJourney | null> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (activeJourney) {
        return await this.update({ id: activeJourney.id }, {
          trackingCount: { increment: 1 }
        });
      }

      return null;
    } catch (error) {
      logger.error('Failed to increment tracking count', { customerId, error });
      throw error;
    }
  }

  /**
   * 시간 측정 업데이트
   */
  async updateTimeMetrics(
    customerId: string,
    metrics: {
      timeToFirstDesign?: number;
      timeToOrdersheet?: number;
      timeToPayment?: number;
    }
  ): Promise<CustomerJourney | null> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (activeJourney) {
        return await this.update({ id: activeJourney.id }, metrics);
      }

      return null;
    } catch (error) {
      logger.error('Failed to update time metrics', { customerId, metrics, error });
      throw error;
    }
  }

  /**
   * 주요 날짜 업데이트
   */
  async updateKeyDates(
    customerId: string,
    dates: {
      firstDesignSentDate?: Date;
      designConfirmDate?: Date;
      ordersheetSentDate?: Date;
      ordersheetCompleteDate?: Date;
    }
  ): Promise<CustomerJourney | null> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (activeJourney) {
        return await this.update({ id: activeJourney.id }, dates);
      }

      return null;
    } catch (error) {
      logger.error('Failed to update key dates', { customerId, dates, error });
      throw error;
    }
  }

  /**
   * 여정 완료 처리
   */
  async completeJourney(customerId: string): Promise<CustomerJourney | null> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (activeJourney) {
        return await this.update({ id: activeJourney.id }, {
          progressStatus: ProgressStatus.COMPLETED
        });
      }

      return null;
    } catch (error) {
      logger.error('Failed to complete journey', { customerId, error });
      throw error;
    }
  }

  /**
   * 여정 드롭 처리
   */
  async dropJourney(customerId: string): Promise<CustomerJourney | null> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (activeJourney) {
        return await this.update({ id: activeJourney.id }, {
          progressStatus: ProgressStatus.DROPPED
        });
      }

      return null;
    } catch (error) {
      logger.error('Failed to drop journey', { customerId, error });
      throw error;
    }
  }

  /**
   * 시간 계산 및 자동 업데이트
   */
  async calculateAndUpdateTimeDifference(
    customerId: string,
    fromDateField: keyof CustomerJourney,
    toDateField: keyof CustomerJourney,
    timeMetricField: keyof CustomerJourney
  ): Promise<CustomerJourney | null> {
    try {
      const activeJourney = await this.findActiveJourney(customerId);

      if (!activeJourney) {
        return null;
      }

      const fromDate = activeJourney[fromDateField] as Date | null;
      const toDate = activeJourney[toDateField] as Date | null;

      if (fromDate && toDate) {
        const diffInMinutes = Math.floor((toDate.getTime() - fromDate.getTime()) / 60000);

        return await this.update({ id: activeJourney.id }, {
          [timeMetricField]: diffInMinutes
        });
      }

      return activeJourney;
    } catch (error) {
      logger.error('Failed to calculate time difference', {
        customerId,
        fromDateField,
        toDateField,
        timeMetricField,
        error
      });
      throw error;
    }
  }
}

export const customerJourneyService = new CustomerJourneyService();