import {
  DesignRequest,
  Prisma,
  DesignRequestType,
  DesignStatus
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

export class DesignRequestService extends BaseService<
  DesignRequest,
  Prisma.DesignRequestCreateInput,
  Prisma.DesignRequestUpdateInput,
  Prisma.DesignRequestWhereInput,
  Prisma.DesignRequestWhereUniqueInput,
  Prisma.DesignRequestOrderByWithRelationInput
> {
  protected model = prisma.designRequest;
  protected modelName = 'DesignRequest';

  /**
   * 고객의 디자인 요청 조회
   */
  async findByCustomerId(customerId: string, options?: {
    requestType?: DesignRequestType;
    status?: DesignStatus;
    limit?: number;
  }) {
    const where: Prisma.DesignRequestWhereInput = { customerId };

    if (options?.requestType) {
      where.requestType = options.requestType;
    }

    if (options?.status) {
      where.status = options.status;
    }

    const results = await this.findMany(where, {
      orderBy: { createdAt: 'desc' },
      limit: options?.limit
    });

    // Include를 위해 Prisma 직접 사용
    return Promise.all(results.map(async (request) => {
      const withIncludes = await prisma.designRequest.findUnique({
        where: { id: request.id },
        include: {
          designFiles: true,
          designs: true
        }
      });
      return withIncludes || request;
    }));
  }

  /**
   * 활성 디자인 요청 조회
   */
  async getActiveDesignRequests(customerId: string) {
    const results = await this.findMany({
      customerId,
      status: {
        in: [DesignStatus.REQUESTED, DesignStatus.IN_PROGRESS, DesignStatus.REVIEW]
      }
    }, {
      orderBy: { createdAt: 'desc' }
    });

    // Include를 위해 Prisma 직접 사용
    return Promise.all(results.map(async (request) => {
      const withIncludes = await prisma.designRequest.findUnique({
        where: { id: request.id },
        include: {
          designFiles: true
        }
      });
      return withIncludes || request;
    }));
  }

  /**
   * 디자인 상태 업데이트
   */
  async updateDesignStatus(
    designRequestId: string,
    newStatus: DesignStatus,
    slackThreadTs?: string
  ) {
    const updateData: Prisma.DesignRequestUpdateInput = {
      status: newStatus,
      ...(slackThreadTs && { slackThreadTs })
    };

    const updated = await this.update({ id: designRequestId }, updateData);

    if (updated) {
      logger.info('Design request status updated', {
        designRequestId,
        oldStatus: updated.status,
        newStatus,
        customerId: updated.customerId
      });
    }

    return updated;
  }

  /**
   * 디자인 파일 추가
   */
  async addDesignFile(
    designRequestId: string,
    fileData: {
      fileUrl: string;
      fileName: string;
      uploadedBy: string;
    }
  ) {
    // DesignFile 생성을 위해 Prisma 클라이언트 직접 사용
    const designFile = await prisma.designFile.create({
      data: {
        designRequestId,
        ...fileData
      }
    });

    logger.info('Design file added', {
      designRequestId,
      fileName: fileData.fileName,
      uploadedBy: fileData.uploadedBy
    });

    return designFile;
  }

  /**
   * 리뷰 대기 중인 디자인 조회
   */
  async getDesignsAwaitingReview() {
    const results = await this.findMany({
      status: DesignStatus.REVIEW
    }, {
      orderBy: { updatedAt: 'asc' }
    });

    // Include를 위해 Prisma 직접 사용
    return Promise.all(results.map(async (request) => {
      const withIncludes = await prisma.designRequest.findUnique({
        where: { id: request.id },
        include: {
          customer: true,
          designFiles: true
        }
      });
      return withIncludes || request;
    }));
  }

  /**
   * 디자인 타입별 통계
   */
  async getDesignStats(customerId?: string) {
    const where: Prisma.DesignRequestWhereInput = customerId ? { customerId } : {};
    const designs = await this.findMany(where);

    const stats = {
      totalRequests: designs.length,
      byType: {} as Record<DesignRequestType, number>,
      byStatus: {} as Record<DesignStatus, number>,
      approvalRate: 0
    };

    // 타입별 분포
    Object.values(DesignRequestType).forEach(type => {
      stats.byType[type] = designs.filter(d => d.requestType === type).length;
    });

    // 상태별 분포
    Object.values(DesignStatus).forEach(status => {
      stats.byStatus[status] = designs.filter(d => d.status === status).length;
    });

    // 승인율 계산
    const totalCompleted = stats.byStatus[DesignStatus.APPROVED] + stats.byStatus[DesignStatus.REJECTED];
    if (totalCompleted > 0) {
      stats.approvalRate = (stats.byStatus[DesignStatus.APPROVED] / totalCompleted) * 100;
    }

    return stats;
  }
}

export const designRequestService = new DesignRequestService();