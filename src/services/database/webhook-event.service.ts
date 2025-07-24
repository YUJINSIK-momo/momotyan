import {
  WebhookEvent,
  Prisma
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * 웹훅 이벤트 관련 데이터베이스 작업을 처리하는 서비스 클래스
 * LINE과 Slack에서 들어오는 웹훅 이벤트를 기록하고 관리합니다.
 */

export class WebhookEventService extends BaseService<
  WebhookEvent,
  Prisma.WebhookEventCreateInput,
  Prisma.WebhookEventUpdateInput,
  Prisma.WebhookEventWhereInput,
  Prisma.WebhookEventWhereUniqueInput,
  Prisma.WebhookEventOrderByWithRelationInput
> {
  protected model = prisma.webhookEvent;
  protected modelName = 'WebhookEvent';

  /**
   * 웹훅 이벤트를 기록합니다.
   * @param {'line' | 'slack'} source - 이벤트 소스
   * @param {string} eventType - 이벤트 타입
   * @param {any} eventData - 이벤트 데이터
   * @returns {Promise<WebhookEvent>} 기록된 웹훅 이벤트
   * @throws {Error} 기록 실패 시 에러 발생
   */
  async logEvent(
    source: 'line' | 'slack',
    eventType: string,
    eventData: unknown
  ): Promise<WebhookEvent> {
    try {
      const event = await this.create({
        source,
        eventType,
        eventData: eventData as Prisma.InputJsonValue
      });

      logger.info('Webhook event logged', {
        id: event.id,
        source,
        eventType
      });

      return event;
    } catch (error) {
      logger.error('Failed to log webhook event', error);
      throw error;
    }
  }

  /**
   * 특정 소스의 웹훅 이벤트를 조회합니다.
   * @param {'line' | 'slack'} source - 이벤트 소스
   * @param {Object} [options] - 조회 옵션
   * @param {number} [options.page] - 페이지 번호
   * @param {number} [options.limit] - 페이지당 항목 수
   * @param {Date} [options.startDate] - 시작 날짜
   * @param {Date} [options.endDate] - 종료 날짜
   * @returns {Promise<PaginatedResult<WebhookEvent>>} 페이지네이션된 이벤트 목록
   */
  async findEventsBySource(
    source: 'line' | 'slack',
    options?: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const where: Prisma.WebhookEventWhereInput = {
      source
    };

    if (options?.startDate || options?.endDate) {
      where.processedAt = {};
      if (options.startDate) {
        where.processedAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.processedAt.lte = options.endDate;
      }
    }

    return this.findManyWithPagination(where, {
      page: options?.page,
      limit: options?.limit,
      orderBy: { processedAt: 'desc' }
    });
  }

  /**
   * 특정 타입의 웹훅 이벤트를 조회합니다.
   * @param {string} eventType - 이벤트 타입
   * @param {Object} [options] - 조회 옵션
   * @param {number} [options.page] - 페이지 번호
   * @param {number} [options.limit] - 페이지당 항목 수
   * @param {'line' | 'slack'} [options.source] - 이벤트 소스 필터
   * @returns {Promise<PaginatedResult<WebhookEvent>>} 페이지네이션된 이벤트 목록
   */
  async findEventsByType(
    eventType: string,
    options?: {
      page?: number;
      limit?: number;
      source?: 'line' | 'slack';
    }
  ) {
    const where: Prisma.WebhookEventWhereInput = {
      eventType
    };

    if (options?.source) {
      where.source = options.source;
    }

    return this.findManyWithPagination(where, {
      page: options?.page,
      limit: options?.limit,
      orderBy: { processedAt: 'desc' }
    });
  }

  /**
   * 웹훅 이벤트 통계를 조회합니다.
   * 전체 이벤트 수, 소스별/타입별 이벤트 수, 최근 이벤트를 반환합니다.
   * @param {Object} [options] - 통계 옵션
   * @param {Date} [options.startDate] - 시작 날짜
   * @param {Date} [options.endDate] - 종료 날짜
   * @returns {Promise<Object>} 이벤트 통계 정보
   * @throws {Error} 통계 조회 실패 시 에러 발생
   */
  async getEventStats(options?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    try {
      const where: Prisma.WebhookEventWhereInput = {};

      if (options?.startDate || options?.endDate) {
        where.processedAt = {};
        if (options.startDate) {
          where.processedAt.gte = options.startDate;
        }
        if (options.endDate) {
          where.processedAt.lte = options.endDate;
        }
      }

      const [
        totalEvents,
        eventsBySource,
        eventsByType,
        recentEvents
      ] = await Promise.all([
        this.count(where),
        this.model.groupBy({
          by: ['source'],
          _count: true,
          where
        }),
        this.model.groupBy({
          by: ['eventType'],
          _count: true,
          where
        }),
        this.findMany(where, {
          limit: 10,
          orderBy: { processedAt: 'desc' }
        })
      ]);

      return {
        total: totalEvents,
        bySource: eventsBySource.reduce((acc, curr) => {
          acc[curr.source] = curr._count;
          return acc;
        }, {} as Record<string, number>),
        byType: eventsByType.reduce((acc, curr) => {
          acc[curr.eventType] = curr._count;
          return acc;
        }, {} as Record<string, number>),
        recent: recentEvents
      };
    } catch (error) {
      logger.error('Failed to get event stats', error);
      throw error;
    }
  }

  /**
   * 오래된 웹훅 이벤트를 정리합니다.
   * 지정된 일수보다 오래된 이벤트를 삭제합니다.
   * @param {number} [daysToKeep=30] - 보관 기간 (기본값: 30일)
   * @returns {Promise<number>} 삭제된 이벤트 수
   * @throws {Error} 정리 실패 시 에러 발생
   */
  async cleanupOldEvents(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const result = await this.deleteMany({
        processedAt: { lt: cutoffDate }
      });

      logger.info(`Cleaned up ${result.count} old webhook events`);
      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup old events', error);
      throw error;
    }
  }

  /**
   * 이벤트 데이터로 웹훅 이벤트를 검색합니다.
   * JSON 경로를 사용하여 특정 값을 가진 이벤트를 찾습니다.
   * @param {Object} searchParams - 검색 파라미터
   * @param {string} searchParams.path - JSON 경로
   * @param {any} searchParams.value - 검색할 값
   * @param {Object} [options] - 검색 옵션
   * @param {number} [options.page] - 페이지 번호
   * @param {number} [options.limit] - 페이지당 항목 수
   * @param {'line' | 'slack'} [options.source] - 이벤트 소스 필터
   * @returns {Promise<PaginatedResult<WebhookEvent>>} 페이지네이션된 이벤트 목록
   * @throws {Error} 검색 실패 시 에러 발생
   */
  async searchEventsByData(
    searchParams: {
      path: string;
      value: unknown;
    },
    options?: {
      page?: number;
      limit?: number;
      source?: 'line' | 'slack';
    }
  ) {
    try {
      const where: Prisma.WebhookEventWhereInput = {
        eventData: {
          path: [searchParams.path],
          equals: searchParams.value as Prisma.InputJsonValue
        }
      };

      if (options?.source) {
        where.source = options.source;
      }

      return this.findManyWithPagination(where, {
        page: options?.page,
        limit: options?.limit,
        orderBy: { processedAt: 'desc' }
      });
    } catch (error) {
      logger.error('Failed to search events by data', error);
      throw error;
    }
  }
}