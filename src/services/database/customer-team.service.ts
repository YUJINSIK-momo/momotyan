import {
  CustomerTeam,
  Prisma
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * 고객 팀 관리 서비스
 * 한 고객이 여러 팀을 가질 수 있도록 관리
 */
export class CustomerTeamService extends BaseService<
  CustomerTeam,
  Prisma.CustomerTeamCreateInput,
  Prisma.CustomerTeamUpdateInput,
  Prisma.CustomerTeamWhereInput,
  Prisma.CustomerTeamWhereUniqueInput,
  Prisma.CustomerTeamOrderByWithRelationInput
> {
  protected model = prisma.customerTeam;
  protected modelName = 'CustomerTeam';

  /**
   * 고객의 모든 팀 조회
   */
  async findByCustomerId(customerId: string, activeOnly: boolean = true): Promise<CustomerTeam[]> {
    try {
      return await this.model.findMany({
        where: {
          customerId,
          ...(activeOnly && { isActive: true })
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error('Failed to find customer teams', { customerId, error });
      throw error;
    }
  }

  /**
   * 고객에게 팀 추가
   */
  async addTeamToCustomer(customerId: string, teamName: string): Promise<CustomerTeam> {
    try {
      // 이미 존재하는지 확인
      const existing = await this.model.findUnique({
        where: {
          customerId_teamName: {
            customerId,
            teamName
          }
        }
      });

      if (existing) {
        // 이미 존재하면 활성화만
        if (!existing.isActive) {
          return await this.update({ id: existing.id }, { isActive: true });
        }
        return existing;
      }

      // 새로 생성
      return await this.create({
        customer: { connect: { id: customerId } },
        teamName,
        isActive: true
      });
    } catch (error) {
      logger.error('Failed to add team to customer', { customerId, teamName, error });
      throw error;
    }
  }

  /**
   * 고객의 팀 제거 (소프트 삭제)
   */
  async removeTeamFromCustomer(customerId: string, teamName: string): Promise<CustomerTeam | null> {
    try {
      const existing = await this.model.findUnique({
        where: {
          customerId_teamName: {
            customerId,
            teamName
          }
        }
      });

      if (existing && existing.isActive) {
        return await this.update({ id: existing.id }, { isActive: false });
      }

      return null;
    } catch (error) {
      logger.error('Failed to remove team from customer', { customerId, teamName, error });
      throw error;
    }
  }

  /**
   * 팀명 중복 확인 및 처리
   */
  async checkDuplicateTeam(teamName: string): Promise<{
    isDuplicate: boolean;
    existingCustomers: string[];
  }> {
    try {
      const existingTeams = await this.model.findMany({
        where: {
          teamName,
          isActive: true
        },
        include: {
          customer: {
            select: {
              id: true,
              lineUserName: true
            }
          }
        }
      });

      return {
        isDuplicate: existingTeams.length > 0,
        existingCustomers: existingTeams.map(team =>
          team.customer.lineUserName || team.customer.id
        )
      };
    } catch (error) {
      logger.error('Failed to check duplicate team', { teamName, error });
      throw error;
    }
  }

  /**
   * 팀명으로 고객 검색
   */
  async findCustomersByTeamName(teamName: string): Promise<CustomerTeam[]> {
    try {
      return await this.model.findMany({
        where: {
          teamName,
          isActive: true
        },
        include: {
          customer: true
        }
      });
    } catch (error) {
      logger.error('Failed to find customers by team name', { teamName, error });
      throw error;
    }
  }
}

export const customerTeamService = new CustomerTeamService();