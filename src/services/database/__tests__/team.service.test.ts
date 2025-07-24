import { TeamService } from '../team.service';
import { prisma } from '../prisma';
import { SportType, Team } from '../../../generated/prisma';
import logger from '../../../utils/logger';

// 의존성 모의 객체 설정
// 데이터베이스 호출을 실제로 수행하지 않고 테스트하기 위해 mock 사용
jest.mock('../prisma', () => ({
  prisma: {
    team: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn()
    },
    teamAlias: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn()
    }
  }
}));

jest.mock('../../../utils/logger');

// TeamService 테스트 스위트
// 팀 정보와 별칭을 관리하는 서비스의 모든 기능을 테스트
describe('TeamService', () => {
  let teamService: TeamService;

  // 각 테스트 전에 실행되는 설정
  // 서비스 인스턴스를 생성하고 모든 mock을 초기화
  beforeEach(() => {
    teamService = new TeamService();
    jest.clearAllMocks();
  });

  // findByNormalizedName 메서드 테스트
  // 정규화된 팀명으로 팀을 찾는 기능 테스트
  describe('findByNormalizedName', () => {
    // 정규화된 이름으로 팀을 찾는 테스트
    it('should find team by normalized name', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '서울라이온즈',
        sportType: SportType.SOCCER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      };

      (prisma.team.findUnique as jest.Mock).mockResolvedValue(mockTeam);

      const result = await teamService.findByNormalizedName('서울라이온즈');

      // 정규화된 이름으로 검색하는 쿼리가 올바른지 검증
      expect(prisma.team.findUnique).toHaveBeenCalledWith({
        where: { normalizedName: '서울라이온즈' },
        include: undefined
      });
      expect(result).toEqual(mockTeam);
    });

    // 별칭을 포함하여 팀을 찾는 테스트
    it('should include aliases when requested', async () => {
      const mockTeamWithAliases = {
        id: '1',
        normalizedName: '서울라이온즈',
        teamAliases: [
          { id: 'a1', teamId: '1', alias: '서울Lions' },
          { id: 'a2', teamId: '1', alias: 'SeoulLions' }
        ]
      };

      (prisma.team.findUnique as jest.Mock).mockResolvedValue(mockTeamWithAliases);

      const result = await teamService.findByNormalizedName('서울라이온즈', true);

      // 별칭을 포함한 검색 쿼리가 올바른지 검증
      expect(prisma.team.findUnique).toHaveBeenCalledWith({
        where: { normalizedName: '서울라이온즈' },
        include: { teamAliases: true }
      });
      expect(result).toEqual(mockTeamWithAliases);
    });
  });

  // findByAlias 메서드 테스트
  // 별칭으로 팀을 찾는 기능 테스트
  describe('findByAlias', () => {
    // 별칭으로 팀을 찾는 테스트
    it('should find team by alias', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '서울라이온즈',
        sportType: SportType.SOCCER
      };

      const mockAlias = {
        id: 'a1',
        teamId: '1',
        alias: '서울Lions',
        team: mockTeam
      };

      (prisma.teamAlias.findFirst as jest.Mock).mockResolvedValue(mockAlias);

      const result = await teamService.findByAlias('서울Lions');

      // 별칭으로 검색하는 쿼리가 올바른지 검증
      expect(prisma.teamAlias.findFirst).toHaveBeenCalledWith({
        where: { alias: '서울Lions' },
        include: { team: true }
      });
      expect(result).toEqual(mockTeam);
    });

    // 별칭을 찾을 수 없을 때 null을 반환하는 테스트
    it('should return null if alias not found', async () => {
      // 별칭이 존재하지 않는 경우
      (prisma.teamAlias.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await teamService.findByAlias('알수없는팀');

      // null이 반환되었는지 확인
      expect(result).toBeNull();
    });
  });

  // findByAnyName 메서드 테스트
  // 정규화된 이름 또는 별칭으로 팀을 찾는 기능 테스트
  describe('findByAnyName', () => {
    // 정규화된 이름을 먼저 찾는 테스트
    it('should find by normalized name first', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '서울라이온즈'
      };

      const findByNormalizedNameSpy = jest
        .spyOn(teamService, 'findByNormalizedName')
        .mockResolvedValue(mockTeam as Team);

      const result = await teamService.findByAnyName('서울라이온즈');

      // 정규화된 이름으로 먼저 검색했는지 검증
      expect(findByNormalizedNameSpy).toHaveBeenCalledWith('서울라이온즈');
      expect(result).toEqual(mockTeam);
    });

    // 정규화된 이름을 찾지 못하면 별칭으로 찾는 테스트
    it('should find by alias if normalized name not found', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '서울라이온즈'
      };

      // 정규화된 이름으로는 찾지 못함
      jest.spyOn(teamService, 'findByNormalizedName').mockResolvedValue(null);
      const findByAliasSpy = jest
        .spyOn(teamService, 'findByAlias')
        .mockResolvedValue(mockTeam as Team);

      const result = await teamService.findByAnyName('서울Lions');

      // 별칭으로 검색했는지 검증
      expect(findByAliasSpy).toHaveBeenCalledWith('서울Lions');
      expect(result).toEqual(mockTeam);
    });
  });

  // createTeam 메서드 테스트
  // 새로운 팀을 생성하는 기능 테스트
  describe('createTeam', () => {
    // 별칭과 함께 팀을 생성하는 테스트
    it('should create team with aliases', async () => {
      const mockCreatedTeam = {
        id: '1',
        normalizedName: '부산이글스',
        sportType: SportType.BASEBALL,
        teamAliases: [
          { id: 'a1', alias: '부산이글스' },
          { id: 'a2', alias: 'BusanEagles' }
        ]
      };

      (prisma.team.create as jest.Mock).mockResolvedValue(mockCreatedTeam);

      const result = await teamService.createTeam(
        {
          normalizedName: '부산이글스',
          sportType: SportType.BASEBALL
        },
        ['BusanEagles']
      );

      // 팀 생성 쿼리가 올바른 파라미터로 호출되었는지 검증
      // 팀 이름 자체도 별칭으로 추가됨
      expect(prisma.team.create).toHaveBeenCalledWith({
        data: {
          normalizedName: '부산이글스',
          sportType: SportType.BASEBALL,
          teamAliases: {
            create: [
              { alias: '부산이글스' },
              { alias: 'BusanEagles' }
            ]
          }
        },
        include: {
          teamAliases: true
        }
      });
      expect(result).toEqual(mockCreatedTeam);
    });

    // 팀 생성 오류 처리 테스트
    // 데이터베이스 오류 발생 시 적절하게 처리되는지 확인
    it('should handle creation errors', async () => {
      const error = new Error('데이터베이스 오류');
      (prisma.team.create as jest.Mock).mockRejectedValue(error);

      // 오류가 적절히 전파되는지 검증
      await expect(
        teamService.createTeam({
          normalizedName: '테스트팀'
        })
      ).rejects.toThrow(error);

      // 로거에 오류가 기록되었는지 확인
      expect(logger.error).toHaveBeenCalledWith('Failed to create team', error);
    });
  });

  // addAlias 메서드 테스트
  // 팀에 새로운 별칭을 추가하는 기능 테스트
  describe('addAlias', () => {
    // 새로운 별칭을 추가하는 테스트
    it('should add new alias', async () => {
      // 기존에 동일한 별칭이 없음
      (prisma.teamAlias.findUnique as jest.Mock).mockResolvedValue(null);

      const mockAlias = {
        id: 'a1',
        teamId: '1',
        alias: '새로운별명'
      };

      (prisma.teamAlias.create as jest.Mock).mockResolvedValue(mockAlias);

      const result = await teamService.addAlias('1', '새로운별명');

      // 별칭 생성 쿼리가 올바른지 검증
      expect(prisma.teamAlias.create).toHaveBeenCalledWith({
        data: { teamId: '1', alias: '새로운별명' }
      });
      expect(result).toEqual(mockAlias);
    });

    // 이미 존재하는 별칭은 추가하지 않는 테스트
    it('should return null if alias already exists', async () => {
      const existingAlias = {
        id: 'a1',
        teamId: '1',
        alias: '기존별명'
      };

      // 이미 별칭이 존재함
      (prisma.teamAlias.findUnique as jest.Mock).mockResolvedValue(existingAlias);

      const result = await teamService.addAlias('1', '기존별명');

      // 생성 함수가 호출되지 않았는지 검증
      expect(prisma.teamAlias.create).not.toHaveBeenCalled();
      // null이 반환되었는지 확인
      expect(result).toBeNull();
    });
  });

  // addAliases 메서드 테스트
  // 여러 개의 별칭을 한 번에 추가하는 기능 테스트
  describe('addAliases', () => {
    // 여러 별칭을 추가하는 테스트
    it('should add multiple aliases', async () => {
      // 기존에 있는 별칭들
      (prisma.teamAlias.findMany as jest.Mock).mockResolvedValue([
        { alias: '기존별명1' },
        { alias: '기존별명2' }
      ]);

      (prisma.teamAlias.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await teamService.addAliases('1', [
        '기존별명1',  // 중복
        '새별명1',
        '새별명2',
        '기존별명2'  // 중복
      ]);

      // 중복된 별칭을 제외하고 새 별칭만 추가했는지 검증
      expect(prisma.teamAlias.createMany).toHaveBeenCalledWith({
        data: [
          { teamId: '1', alias: '새별명1' },
          { teamId: '1', alias: '새별명2' }
        ],
        skipDuplicates: true
      });
      // 2개의 별칭이 추가되었는지 확인
      expect(result).toBe(2);
    });
  });

  // searchTeams 메서드 테스트
  // 팀명이나 별칭으로 팀을 검색하는 기능 테스트
  describe('searchTeams', () => {
    // 이름과 별칭으로 팀을 검색하는 테스트
    it('should search teams by name and aliases', async () => {
      const mockTeams = [
        {
          id: '1',
          normalizedName: '서울라이온즈',
          teamAliases: []
        }
      ];

      (prisma.team.findMany as jest.Mock).mockResolvedValue(mockTeams);

      const result = await teamService.searchTeams('서울');

      // 검색 쿼리가 올바른지 검증
      // 팀명과 별칭 모두에서 검색하고 활성 팀만 포함
      expect(prisma.team.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              normalizedName: {
                contains: '서울',
                mode: 'insensitive'
              }
            },
            {
              teamAliases: {
                some: {
                  alias: {
                    contains: '서울',
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
        take: 10,  // 최대 10개까지만 반환
        orderBy: {
          normalizedName: 'asc'
        }
      });
      expect(result).toEqual(mockTeams);
    });
  });

  // getTeamStats 메서드 테스트
  // 팀 관련 통계를 반환하는 기능 테스트
  describe('getTeamStats', () => {
    // 팀 통계를 반환하는 테스트
    it('should return team statistics', async () => {
      // 모의 데이터 설정
      (prisma.team.count as jest.Mock)
        .mockResolvedValueOnce(10) // 전체 팀 수
        .mockResolvedValueOnce(8); // 활성 팀 수

      // 스포츠별 팀 수
      (prisma.team.groupBy as jest.Mock).mockResolvedValue([
        { sportType: SportType.SOCCER, _count: 3 },
        { sportType: SportType.BASEBALL, _count: 3 },
        { sportType: SportType.BASKETBALL, _count: 2 }
      ]);

      // 전체 별칭 수
      (prisma.teamAlias.count as jest.Mock).mockResolvedValue(24);

      const result = await teamService.getTeamStats();

      // 통계 결과가 올바른지 검증
      expect(result).toEqual({
        total: 10,           // 전체 팀 수
        active: 8,           // 활성 팀 수
        bySport: {           // 스포츠별 팀 수
          SOCCER: 3,
          BASEBALL: 3,
          BASKETBALL: 2
        },
        averageAliasesPerTeam: 3  // 팀당 평균 별칭 수 (24 / 8)
      });
    });
  });

  // deactivateTeam 메서드 테스트
  // 팀을 비활성화하는 기능 테스트
  describe('deactivateTeam', () => {
    // 팀을 비활성화하는 테스트
    it('should deactivate team', async () => {
      const mockTeam = {
        id: '1',
        isActive: false
      };

      const updateSpy = jest
        .spyOn(teamService, 'update')
        .mockResolvedValue(mockTeam as Team);

      const result = await teamService.deactivateTeam('1');

      // update 메서드가 올바른 파라미터로 호출되었는지 검증
      expect(updateSpy).toHaveBeenCalledWith(
        { id: '1' },
        { isActive: false }
      );
      expect(result).toEqual(mockTeam);
    });
  });

  // activateTeam 메서드 테스트
  // 팀을 활성화하는 기능 테스트
  describe('activateTeam', () => {
    // 팀을 활성화하는 테스트
    it('should activate team', async () => {
      const mockTeam = {
        id: '1',
        isActive: true
      };

      const updateSpy = jest
        .spyOn(teamService, 'update')
        .mockResolvedValue(mockTeam as Team);

      const result = await teamService.activateTeam('1');

      // update 메서드가 올바른 파라미터로 호출되었는지 검증
      expect(updateSpy).toHaveBeenCalledWith(
        { id: '1' },
        { isActive: true }
      );
      expect(result).toEqual(mockTeam);
    });
  });

  // updateSportType 메서드 테스트
  // 팀의 스포츠 종목을 업데이트하는 기능 테스트
  describe('updateSportType', () => {
    // 스포츠 종목을 업데이트하는 테스트
    it('should update sport type', async () => {
      const mockTeam = {
        id: '1',
        sportType: SportType.BASKETBALL
      };

      const updateSpy = jest
        .spyOn(teamService, 'update')
        .mockResolvedValue(mockTeam as Team);

      const result = await teamService.updateSportType('1', SportType.BASKETBALL);

      // update 메서드가 올바른 파라미터로 호출되었는지 검증
      expect(updateSpy).toHaveBeenCalledWith(
        { id: '1' },
        { sportType: SportType.BASKETBALL }
      );
      expect(result).toEqual(mockTeam);
    });
  });
});