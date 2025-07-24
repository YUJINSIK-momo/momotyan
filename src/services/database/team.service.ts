import {
  Team,
  TeamAlias,
  Prisma,
  SportType
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

/**
 * 팀 정보 관련 데이터베이스 작업을 처리하는 서비스 클래스
 * 팀의 정규화된 이름과 변형들을 관리합니다.
 */

export class TeamService extends BaseService<
  Team,
  Prisma.TeamCreateInput,
  Prisma.TeamUpdateInput,
  Prisma.TeamWhereInput,
  Prisma.TeamWhereUniqueInput,
  Prisma.TeamOrderByWithRelationInput
> {
  model = prisma.team;
  protected modelName = 'Team';

  /**
   * 정규화된 팀 이름으로 팀을 조회합니다.
   * @param normalizedName 정규화된 팀 이름
   * @param includeAliases 별칭 포함 여부
   * @returns 팀 정보 또는 null
   */
  async findByNormalizedName(
    normalizedName: string,
    includeAliases: boolean = false
  ): Promise<Team | null> {
    return this.model.findUnique({
      where: { normalizedName },
      include: includeAliases ? { teamAliases: true } : undefined
    });
  }

  /**
   * 별칭으로 팀을 찾습니다.
   * @param alias 팀 별칭
   * @returns 팀 정보 또는 null
   */
  async findByAlias(alias: string): Promise<Team | null> {
    const teamAlias = await prisma.teamAlias.findFirst({
      where: { alias },
      include: { team: true }
    });

    return teamAlias?.team || null;
  }

  /**
   * 팀 이름(정규화된 이름 또는 별칭)으로 팀을 찾습니다.
   * @param teamName 팀 이름
   * @returns 팀 정보 또는 null
   */
  async findByAnyName(teamName: string): Promise<Team | null> {
    // 1. 정규화된 이름으로 찾기
    let team = await this.findByNormalizedName(teamName);
    if (team) {
      return team;
    }

    // 2. 별칭으로 찾기
    team = await this.findByAlias(teamName);
    if (team) {
      return team;
    }

    return null;
  }

  /**
   * 새로운 팀을 생성합니다.
   * @param data 팀 생성 데이터
   * @param aliases 초기 별칭 목록
   * @returns 생성된 팀
   */
  async createTeam(
    data: {
      normalizedName: string;
      sportType?: SportType;
    },
    aliases: string[] = []
  ): Promise<Team> {
    try {
      // 별칭 목록에 정규화된 이름도 포함
      const allAliases = [...new Set([data.normalizedName, ...aliases])];

      const team = await this.model.create({
        data: {
          normalizedName: data.normalizedName,
          sportType: data.sportType,
          teamAliases: {
            create: allAliases.map(alias => ({ alias }))
          }
        },
        include: {
          teamAliases: true
        }
      });

      logger.info('Team created successfully', {
        teamId: team.id,
        normalizedName: team.normalizedName,
        aliasCount: allAliases.length
      });

      return team;
    } catch (error) {
      logger.error('Failed to create team', error);
      throw error;
    }
  }

  /**
   * 팀에 새로운 별칭을 추가합니다.
   * @param teamId 팀 ID
   * @param alias 추가할 별칭
   * @returns 생성된 별칭 또는 null (이미 존재하는 경우)
   */
  async addAlias(teamId: string, alias: string): Promise<TeamAlias | null> {
    try {
      // 이미 존재하는지 확인
      const existing = await prisma.teamAlias.findUnique({
        where: {
          teamId_alias: { teamId, alias }
        }
      });

      if (existing) {
        logger.info('Alias already exists', { teamId, alias });
        return null;
      }

      const teamAlias = await prisma.teamAlias.create({
        data: { teamId, alias }
      });

      logger.info('Team alias added successfully', { teamId, alias });
      return teamAlias;
    } catch (error) {
      logger.error('Failed to add team alias', error);
      throw error;
    }
  }

  /**
   * 여러 별칭을 한 번에 추가합니다.
   * @param teamId 팀 ID
   * @param aliases 추가할 별칭 목록
   * @returns 추가된 별칭 수
   */
  async addAliases(teamId: string, aliases: string[]): Promise<number> {
    try {
      // 기존 별칭 조회
      const existingAliases = await prisma.teamAlias.findMany({
        where: { teamId },
        select: { alias: true }
      });

      const existingSet = new Set(existingAliases.map(a => a.alias));
      const newAliases = aliases.filter(alias => !existingSet.has(alias));

      if (newAliases.length === 0) {
        return 0;
      }

      const result = await prisma.teamAlias.createMany({
        data: newAliases.map(alias => ({ teamId, alias })),
        skipDuplicates: true
      });

      logger.info('Team aliases added', {
        teamId,
        addedCount: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to add team aliases', error);
      throw error;
    }
  }

  /**
   * 스포츠 종류별로 팀을 조회합니다.
   * @param sportType 스포츠 종류
   * @param options 페이지네이션 옵션
   * @returns 페이지네이션된 팀 목록
   */
  async findBySportType(
    sportType: SportType,
    options?: {
      page?: number;
      limit?: number;
      includeAliases?: boolean;
    }
  ) {
    const { includeAliases, ...paginationOptions } = options || {};

    const result = await this.findManyWithPagination(
      {
        sportType,
        isActive: true,
        deletedAt: null
      },
      {
        ...paginationOptions,
        orderBy: { normalizedName: 'asc' }
      }
    );

    // includeAliases가 true인 경우 별도로 별칭 조회
    if (includeAliases && result.data.length > 0) {
      const teamIds = result.data.map(team => team.id);
      const aliases = await prisma.teamAlias.findMany({
        where: { teamId: { in: teamIds } }
      });

      // 팀별로 별칭 매핑
      const aliasMap = new Map<string, typeof aliases>();
      aliases.forEach(alias => {
        if (!aliasMap.has(alias.teamId)) {
          aliasMap.set(alias.teamId, []);
        }
        const teamAliases = aliasMap.get(alias.teamId);
        if (teamAliases) {
          teamAliases.push(alias);
        }
      });

      // 결과에 별칭 추가
      result.data = result.data.map(team => ({
        ...team,
        teamAliases: aliasMap.get(team.id) || []
      }));
    }

    return result;
  }

  /**
   * 활성 팀 목록을 조회합니다.
   * @param options 조회 옵션
   * @returns 페이지네이션된 팀 목록
   */
  async findActiveTeams(options?: {
    page?: number;
    limit?: number;
    includeAliases?: boolean;
  }) {
    const { includeAliases, ...paginationOptions } = options || {};

    const result = await this.findManyWithPagination(
      {
        isActive: true,
        deletedAt: null
      },
      {
        ...paginationOptions,
        orderBy: { normalizedName: 'asc' }
      }
    );

    // includeAliases가 true인 경우 별도로 별칭 조회
    if (includeAliases && result.data.length > 0) {
      const teamIds = result.data.map(team => team.id);
      const aliases = await prisma.teamAlias.findMany({
        where: { teamId: { in: teamIds } }
      });

      // 팀별로 별칭 매핑
      const aliasMap = new Map<string, typeof aliases>();
      aliases.forEach(alias => {
        if (!aliasMap.has(alias.teamId)) {
          aliasMap.set(alias.teamId, []);
        }
        const teamAliases = aliasMap.get(alias.teamId);
        if (teamAliases) {
          teamAliases.push(alias);
        }
      });

      // 결과에 별칭 추가
      result.data = result.data.map(team => ({
        ...team,
        teamAliases: aliasMap.get(team.id) || []
      }));
    }

    return result;
  }

  /**
   * 팀을 비활성화합니다.
   * @param teamId 팀 ID
   * @returns 업데이트된 팀
   */
  async deactivateTeam(teamId: string): Promise<Team> {
    return this.update(
      { id: teamId },
      { isActive: false }
    );
  }

  /**
   * 팀을 활성화합니다.
   * @param teamId 팀 ID
   * @returns 업데이트된 팀
   */
  async activateTeam(teamId: string): Promise<Team> {
    return this.update(
      { id: teamId },
      { isActive: true }
    );
  }

  /**
   * 팀의 스포츠 종류를 업데이트합니다.
   * @param teamId 팀 ID
   * @param sportType 스포츠 종류
   * @returns 업데이트된 팀
   */
  async updateSportType(teamId: string, sportType: SportType): Promise<Team> {
    return this.update(
      { id: teamId },
      { sportType }
    );
  }

  /**
   * 유사한 팀 이름을 검색합니다.
   * @param searchTerm 검색어
   * @param limit 결과 제한
   * @returns 유사한 팀 목록
   */
  async searchTeams(searchTerm: string, limit: number = 10): Promise<Team[]> {
    const teams = await this.model.findMany({
      where: {
        OR: [
          {
            normalizedName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            teamAliases: {
              some: {
                alias: {
                  contains: searchTerm,
                  mode: 'insensitive'
                }
              }
            }
          }
        ],
        isActive: true,
        deletedAt: null
      },
      include: {
        teamAliases: true
      },
      take: limit,
      orderBy: {
        normalizedName: 'asc'
      }
    });

    return teams;
  }

  /**
   * 팀 통계를 조회합니다.
   * @returns 팀 통계 정보
   */
  async getTeamStats() {
    try {
      const [
        totalTeams,
        activeTeams,
        teamsBySport,
        totalAliases
      ] = await Promise.all([
        this.count({ deletedAt: null }),
        this.count({ isActive: true, deletedAt: null }),
        this.model.groupBy({
          by: ['sportType'],
          _count: true,
          where: { isActive: true, deletedAt: null }
        }),
        prisma.teamAlias.count()
      ]);

      return {
        total: totalTeams,
        active: activeTeams,
        bySport: teamsBySport.reduce((acc, curr) => {
          if (curr.sportType) {
            acc[curr.sportType] = curr._count;
          }
          return acc;
        }, {} as Record<SportType, number>),
        averageAliasesPerTeam: activeTeams > 0 ? totalAliases / activeTeams : 0
      };
    } catch (error) {
      logger.error('Failed to get team stats', error);
      throw error;
    }
  }
}

export const teamService = new TeamService();