import {
  Design,
  Prisma
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * 디자인 관련 데이터베이스 작업을 처리하는 서비스
 */
export class DesignService extends BaseService<
  Design,
  Prisma.DesignCreateInput,
  Prisma.DesignUpdateInput,
  Prisma.DesignWhereInput,
  Prisma.DesignWhereUniqueInput,
  Prisma.DesignOrderByWithRelationInput
> {
  protected model = prisma.design;
  protected modelName = 'Design';

  /**
   * 고객의 최신 디자인 조회
   */
  async findLatestByCustomerId(customerId: string): Promise<Design | null> {
    try {
      return await this.model.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error('Failed to find latest design', { customerId, error });
      throw error;
    }
  }

  /**
   * 수정 회수 증가
   */
  async incrementRevisionCount(
    designId: string,
    revisionNumber: 1 | 2 | 3
  ): Promise<Design> {
    try {
      const field = `revision${revisionNumber}Count` as const;

      return await this.update({ id: designId }, {
        [field]: { increment: 1 }
      });
    } catch (error) {
      logger.error('Failed to increment revision count', {
        designId,
        revisionNumber,
        error
      });
      throw error;
    }
  }

  /**
   * 디자인 요청과 연결된 디자인 생성
   */
  async createWithDesignRequest(
    customerId: string,
    designRequestId: string
  ): Promise<Design> {
    try {
      return await this.create({
        customer: { connect: { id: customerId } },
        designRequest: { connect: { id: designRequestId } }
      });
    } catch (error) {
      logger.error('Failed to create design with request', {
        customerId,
        designRequestId,
        error
      });
      throw error;
    }
  }

  /**
   * 수정 회수 통계
   */
  async getRevisionStats(customerId: string): Promise<{
    totalRevisions: number;
    revision1: number;
    revision2: number;
    revision3: number;
  }> {
    try {
      const design = await this.findLatestByCustomerId(customerId);

      if (!design) {
        return {
          totalRevisions: 0,
          revision1: 0,
          revision2: 0,
          revision3: 0
        };
      }

      const totalRevisions =
        design.revision1Count +
        design.revision2Count +
        design.revision3Count;

      return {
        totalRevisions,
        revision1: design.revision1Count,
        revision2: design.revision2Count,
        revision3: design.revision3Count
      };
    } catch (error) {
      logger.error('Failed to get revision stats', { customerId, error });
      throw error;
    }
  }

  /**
   * 특정 텍스트 패턴으로 수정 회수 자동 증가
   * "1st 수정 시안 보내드립니다" 같은 메시지 감지 시 사용
   */
  async incrementRevisionByMessage(
    customerId: string,
    message: string
  ): Promise<Design | null> {
    try {
      const design = await this.findLatestByCustomerId(customerId);
      if (!design) {
        return null;
      }

      // 패턴 매칭
      const patterns = [
        { pattern: /1st\s*수정\s*시안/i, revision: 1 },
        { pattern: /2nd\s*수정\s*시안/i, revision: 2 },
        { pattern: /3rd\s*수정\s*시안/i, revision: 3 }
      ];

      for (const { pattern, revision } of patterns) {
        if (pattern.test(message)) {
          return await this.incrementRevisionCount(
            design.id,
            revision as 1 | 2 | 3
          );
        }
      }

      return design;
    } catch (error) {
      logger.error('Failed to increment revision by message', {
        customerId,
        message,
        error
      });
      throw error;
    }
  }
}

export const designService = new DesignService();