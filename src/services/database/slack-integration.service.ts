import {
  SlackIntegration,
  Prisma
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * Slack 통합 관련 데이터베이스 작업을 처리하는 서비스 클래스
 * 고객별 Slack 채널 및 스레드 관리를 담당합니다.
 */
export class SlackIntegrationService extends BaseService<
  SlackIntegration,
  Prisma.SlackIntegrationCreateInput,
  Prisma.SlackIntegrationUpdateInput,
  Prisma.SlackIntegrationWhereInput,
  Prisma.SlackIntegrationWhereUniqueInput,
  Prisma.SlackIntegrationOrderByWithRelationInput
> {
  protected model = prisma.slackIntegration;
  protected modelName = 'SlackIntegration';

  /**
   * 고객 ID로 Slack 통합 정보를 조회합니다.
   * @param {string} customerId - 고객 ID
   * @returns {Promise<SlackIntegration | null>} Slack 통합 정보 또는 null
   */
  async findByCustomerId(customerId: string): Promise<SlackIntegration | null> {
    return this.findUnique({ customerId });
  }

  /**
   * 고객의 Slack 통합 정보를 생성하거나 업데이트합니다.
   * @param {string} customerId - 고객 ID
   * @param {Object} data - 업데이트할 데이터
   * @returns {Promise<SlackIntegration>} 생성/업데이트된 통합 정보
   */
  async createOrUpdateByCustomerId(
    customerId: string,
    data: {
      primaryChannel?: string;
      teamId?: string;
      teamDomain?: string;
      threadTs?: string;
      isActive?: boolean;
    }
  ): Promise<SlackIntegration> {
    try {
      const integration = await this.model.upsert({
        where: { customerId },
        create: {
          customerId,
          isActive: true,
          ...data
        },
        update: data
      });

      logger.info('Slack integration upserted successfully', {
        customerId,
        primaryChannel: data.primaryChannel
      });

      return integration;
    } catch (error) {
      logger.error('Failed to upsert slack integration', error);
      throw error;
    }
  }

  /**
   * 고객의 주요 Slack 채널을 업데이트합니다.
   * @param {string} customerId - 고객 ID
   * @param {string} channelId - Slack 채널 ID
   * @returns {Promise<SlackIntegration>} 업데이트된 통합 정보
   */
  async updatePrimaryChannel(
    customerId: string,
    channelId: string
  ): Promise<SlackIntegration> {
    return this.createOrUpdateByCustomerId(customerId, {
      primaryChannel: channelId
    });
  }

  /**
   * 현재 활성 스레드를 업데이트합니다.
   * @param {string} customerId - 고객 ID
   * @param {string} threadTs - Slack 스레드 타임스탬프
   * @returns {Promise<SlackIntegration>} 업데이트된 통합 정보
   */
  async updateCurrentThread(
    customerId: string,
    threadTs: string
  ): Promise<SlackIntegration> {
    return this.createOrUpdateByCustomerId(customerId, {
      threadTs: threadTs
    });
  }

  /**
   * 고객의 Slack 통합을 비활성화합니다.
   * @param {string} customerId - 고객 ID
   * @returns {Promise<SlackIntegration>} 업데이트된 통합 정보
   */
  async deactivate(customerId: string): Promise<SlackIntegration> {
    return this.update(
      { customerId },
      {
        isActive: false,
        threadTs: null
      }
    );
  }

  /**
   * 특정 채널의 활성 통합을 조회합니다.
   * @param {string} channelId - Slack 채널 ID
   * @returns {Promise<SlackIntegration[]>} 활성 통합 목록
   */
  async findActiveByChannel(channelId: string): Promise<SlackIntegration[]> {
    return this.findMany({
      primaryChannel: channelId,
      isActive: true
    });
  }

  /**
   * 채널별 활성 통합 수를 조회합니다.
   * @returns {Promise<Object>} 채널별 활성 통합 수
   */
  async getChannelStats() {
    try {
      const stats = await this.model.groupBy({
        by: ['primaryChannel'],
        _count: {
          _all: true
        },
        where: {
          isActive: true,
          primaryChannel: { not: null }
        }
      });

      return stats.reduce((acc, curr) => {
        if (curr.primaryChannel && curr._count) {
          const count = curr._count as { _all: number };
          acc[curr.primaryChannel] = count._all || 0;
        }
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      logger.error('Failed to get channel stats', error);
      throw error;
    }
  }
}