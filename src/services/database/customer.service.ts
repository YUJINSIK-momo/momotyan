import {
  Customer,
  Prisma,
  CustomerType,
  FriendAddStatus,
  ChatStatus,
  SportType,
  Brand
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * 고객 관련 데이터베이스 작업을 처리하는 서비스 클래스
 * LINE 사용자 관리, 친구 상태, 채팅 상태 등을 관리합니다.
 */

export class CustomerService extends BaseService<
  Customer,
  Prisma.CustomerCreateInput,
  Prisma.CustomerUpdateInput,
  Prisma.CustomerWhereInput,
  Prisma.CustomerWhereUniqueInput,
  Prisma.CustomerOrderByWithRelationInput
> {
  protected model = prisma.customer;
  protected modelName = 'Customer';

  /**
   * LINE 사용자 ID로 고객을 조회합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @returns {Promise<Customer | null>} 조회된 고객 또는 null
   */
  async findByLineUserId(lineUserId: string): Promise<Customer | null> {
    return this.findUnique({ lineUserId });
  }

  /**
   * LINE 사용자 ID로 고객을 생성하거나 업데이트합니다.
   * 고객이 없으면 새로 생성하고, 있으면 업데이트합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {Partial<Prisma.CustomerCreateInput>} data - 생성/업데이트할 데이터
   * @returns {Promise<Customer>} 생성/업데이트된 고객
   * @throws {Error} 생성/업데이트 실패 시 에러 발생
   */
  async createOrUpdateByLineUserId(
    lineUserId: string,
    data: Partial<Prisma.CustomerCreateInput>
  ): Promise<Customer> {
    try {
      const customer = await this.model.upsert({
        where: { lineUserId },
        create: {
          lineUserId,
          customerType: CustomerType.NEW,
          friendAddStatus: FriendAddStatus.FRIEND,
          chatStatus: ChatStatus.NO_RESPONSE,
          ...data
        },
        update: data
      });
      logger.info('Customer upserted successfully', { lineUserId });
      return customer;
    } catch (error) {
      logger.error('Failed to upsert customer', error);
      throw error;
    }
  }

  /**
   * 고객의 친구 상태를 업데이트합니다.
   * 차단 상태로 변경 시 차단 날짜를 기록합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {FriendAddStatus} status - 새로운 친구 상태
   * @param {Date} [blockDate] - 차단 날짜 (선택사항)
   * @returns {Promise<Customer>} 업데이트된 고객
   */
  async updateFriendStatus(
    lineUserId: string,
    status: FriendAddStatus,
    blockDate?: Date
  ): Promise<Customer> {
    const updateData: Prisma.CustomerUpdateInput = {
      friendAddStatus: status
    };

    if (status === FriendAddStatus.BLOCKED) {
      updateData.blockDate = blockDate || new Date();
    }

    return this.update({ lineUserId }, updateData);
  }

  /**
   * LINE Follow 이벤트로부터 고객을 생성합니다.
   * 신규 고객 생성과 프로필 정보 저장을 처리합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {object} profile - LINE 프로필 정보
   * @param {Brand} brand - 브랜드 정보 (필수)
   * @returns {Promise<Customer>} 생성된 고객
   */
  async createFromLineFollow(
    lineUserId: string,
    profile: {
      displayName?: string;
      pictureUrl?: string;
      statusMessage?: string;
    },
    brand: Brand
  ): Promise<Customer> {
    try {
      // 이미 존재하는 고객인지 확인
      const existingCustomer = await this.findByLineUserId(lineUserId);

      if (existingCustomer) {
        // 기존 고객이면 친구 상태만 업데이트
        logger.info('Existing customer re-added as friend', { lineUserId });
        return this.updateFriendStatus(lineUserId, FriendAddStatus.FRIEND);
      }

      // 신규 고객 생성
      const customer = await this.create({
        lineUserId,
        lineUserName: profile.displayName,
        customerType: CustomerType.NEW,
        friendAddStatus: FriendAddStatus.FRIEND,
        chatStatus: ChatStatus.NO_RESPONSE,
        brand
      });

      logger.info('New customer created from LINE follow', {
        customerId: customer.id,
        lineUserId,
        displayName: profile.displayName
      });

      return customer;
    } catch (error) {
      logger.error('Failed to create customer from LINE follow', {
        lineUserId,
        error
      });
      throw error;
    }
  }

  /**
   * 고객의 채팅 상태를 업데이트합니다.
   * 마지막 메시지 날짜도 함께 업데이트합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {ChatStatus} status - 새로운 채팅 상태
   * @returns {Promise<Customer>} 업데이트된 고객
   */
  async updateChatStatus(
    lineUserId: string,
    status: ChatStatus
  ): Promise<Customer> {
    return this.update(
      { lineUserId },
      {
        chatStatus: status,
        lastMessageDate: new Date()
      }
    );
  }

  /**
   * 고객 유형을 업데이트합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {CustomerType} type - 새로운 고객 유형
   * @returns {Promise<Customer>} 업데이트된 고객
   */
  async updateCustomerType(
    lineUserId: string,
    type: CustomerType
  ): Promise<Customer> {
    return this.update({ lineUserId }, { customerType: type });
  }

  /**
   * 활성 고객을 조회합니다.
   * 친구 상태이고 삭제되지 않은 고객을 마지막 메시지 날짜 순으로 반환합니다.
   * @param {Object} [options] - 페이지네이션 옵션
   * @param {number} [options.page] - 페이지 번호
   * @param {number} [options.limit] - 페이지당 항목 수
   * @returns {Promise<PaginatedResult<Customer>>} 페이지네이션된 고객 목록
   */
  async findActiveCustomers(
    options?: {
      page?: number;
      limit?: number;
    }
  ) {
    return this.findManyWithPagination(
      {
        friendAddStatus: FriendAddStatus.FRIEND,
        deletedAt: null
      },
      {
        ...options,
        orderBy: { lastMessageDate: 'desc' }
      }
    );
  }

  /**
   * 특정 유형의 고객을 조회합니다.
   * @param {CustomerType} type - 고객 유형
   * @param {Object} [options] - 페이지네이션 옵션
   * @param {number} [options.page] - 페이지 번호
   * @param {number} [options.limit] - 페이지당 항목 수
   * @returns {Promise<PaginatedResult<Customer>>} 페이지네이션된 고객 목록
   */
  async findCustomersByType(
    type: CustomerType,
    options?: {
      page?: number;
      limit?: number;
    }
  ) {
    return this.findManyWithPagination(
      {
        customerType: type,
        deletedAt: null
      },
      {
        ...options,
        orderBy: { createdAt: 'desc' }
      }
    );
  }

  /**
   * 고객 통계를 조회합니다.
   * 전체 고객 수, 활성 고객 수, 차단된 고객 수, 유형별 고객 수를 반환합니다.
   * @returns {Promise<Object>} 고객 통계 정보
   * @throws {Error} 통계 조회 실패 시 에러 발생
   */
  async getCustomerStats() {
    try {
      const [
        totalCustomers,
        activeCustomers,
        blockedCustomers,
        customersByType
      ] = await Promise.all([
        this.count({ deletedAt: null }),
        this.count({
          friendAddStatus: FriendAddStatus.FRIEND,
          deletedAt: null
        }),
        this.count({
          friendAddStatus: FriendAddStatus.BLOCKED,
          deletedAt: null
        }),
        this.model.groupBy({
          by: ['customerType'],
          _count: true,
          where: { deletedAt: null }
        })
      ]);

      return {
        total: totalCustomers,
        active: activeCustomers,
        blocked: blockedCustomers,
        byType: customersByType.reduce((acc, curr) => {
          acc[curr.customerType] = curr._count;
          return acc;
        }, {} as Record<CustomerType, number>)
      };
    } catch (error) {
      logger.error('Failed to get customer stats', error);
      throw error;
    }
  }

  /**
   * 비활성 고객을 조회합니다.
   * 지정된 일수 동안 메시지를 보내지 않은 고객을 찾습니다.
   * @param {number} [daysInactive=30] - 비활성 기준 일수 (기본값: 30일)
   * @returns {Promise<Customer[]>} 비활성 고객 목록
   */
  async findInactiveCustomers(daysInactive: number = 30) {
    const inactiveDate = new Date();
    inactiveDate.setDate(inactiveDate.getDate() - daysInactive);

    return this.findMany({
      OR: [
        { lastMessageDate: { lt: inactiveDate } },
        { lastMessageDate: null }
      ],
      friendAddStatus: FriendAddStatus.FRIEND,
      deletedAt: null
    });
  }

  /**
   * 고객의 팀 정보를 업데이트합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {string} teamName - 팀 이름
   * @param {SportType} [sportType] - 스포츠 종목 (선택사항)
   * @returns {Promise<Customer>} 업데이트된 고객
   */
  async updateTeamInfo(
    lineUserId: string,
    teamName: string,
    sportType?: SportType
  ): Promise<Customer> {
    const updateData: Prisma.CustomerUpdateInput = {
      teamName
    };

    if (sportType) {
      updateData.sportType = sportType;
    }

    return this.update({ lineUserId }, updateData);
  }

  /**
   * 팀 이름으로 고객을 조회합니다.
   * @param {string} teamName - 팀 이름
   * @returns {Promise<Customer[]>} 해당 팀의 고객 목록
   */
  async findByTeamName(teamName: string): Promise<Customer[]> {
    return this.findMany({
      teamName,
      deletedAt: null
    });
  }

  /**
   * 스포츠 종목별로 고객을 조회합니다.
   * @param {SportType} sportType - 스포츠 종목
   * @param {Object} [options] - 페이지네이션 옵션
   * @param {number} [options.page] - 페이지 번호
   * @param {number} [options.limit] - 페이지당 항목 수
   * @returns {Promise<PaginatedResult<Customer>>} 페이지네이션된 고객 목록
   */
  async findBySportType(
    sportType: SportType,
    options?: {
      page?: number;
      limit?: number;
    }
  ) {
    return this.findManyWithPagination(
      {
        sportType,
        deletedAt: null
      },
      {
        ...options,
        orderBy: { createdAt: 'desc' }
      }
    );
  }

  /**
   * 팀 정보가 없는 고객을 조회합니다.
   * @returns {Promise<Customer[]>} 팀 정보가 없는 고객 목록
   */
  async findCustomersWithoutTeam(): Promise<Customer[]> {
    return this.findMany({
      teamName: null,
      friendAddStatus: FriendAddStatus.FRIEND,
      deletedAt: null
    });
  }

  /**
   * 스포츠별 팀 통계를 조회합니다.
   * @returns {Promise<Object>} 스포츠별 팀 수 및 고객 수
   */
  async getTeamStatsBySport() {
    try {
      const sportStats = await this.model.groupBy({
        by: ['sportType'],
        _count: {
          _all: true,
          teamName: true
        },
        where: {
          deletedAt: null,
          teamName: { not: null }
        }
      });

      const uniqueTeamsBySport = await Promise.all(
        Object.values(SportType).map(async (sport) => {
          const teams = await this.model.findMany({
            where: {
              sportType: sport,
              teamName: { not: null },
              deletedAt: null
            },
            select: {
              teamName: true
            },
            distinct: ['teamName']
          });
          return {
            sport,
            uniqueTeams: teams.length
          };
        })
      );

      return {
        customersBySport: sportStats.reduce((acc, curr) => {
          if (curr.sportType) {
            acc[curr.sportType] = curr._count._all;
          }
          return acc;
        }, {} as Record<SportType, number>),
        uniqueTeamsBySport: uniqueTeamsBySport.reduce((acc, curr) => {
          acc[curr.sport] = curr.uniqueTeams;
          return acc;
        }, {} as Record<SportType, number>)
      };
    } catch (error) {
      logger.error('Failed to get team stats by sport', error);
      throw error;
    }
  }

  /**
   * 고객의 스포츠 타입과 브랜드를 업데이트합니다.
   * @param {string} lineUserId - LINE 사용자 ID
   * @param {SportType} sportType - 스포츠 종목
   * @param {string} [brand] - 브랜드 (ILB_MAX 또는 MAX2MAX)
   * @returns {Promise<Customer>} 업데이트된 고객
   */
  async updateSportAndBrand(
    lineUserId: string,
    sportType: SportType,
    brand?: string
  ): Promise<Customer> {
    const updateData: Prisma.CustomerUpdateInput = {
      sportType
    };

    // 스포츠 타입에 따른 브랜드 자동 설정
    if (!brand) {
      if (sportType === SportType.BASEBALL) {
        brand = 'ILB_MAX';
      } else if (sportType === SportType.SOCCER || sportType === SportType.BASKETBALL) {
        brand = 'MAX2MAX';
      }
    }

    if (brand) {
      // 문자열을 Brand enum으로 변환
      updateData.brand = brand as Brand;
    }

    logger.info('Updating customer sport type and brand', {
      lineUserId,
      sportType,
      brand
    });

    return this.update({ lineUserId }, updateData);
  }
}