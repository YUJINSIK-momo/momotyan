import { TeamNormalizationService } from '../team-normalization';
import { teamService } from '../database';
import { SportType } from '../../generated/prisma';
import logger from '../../utils/logger';

// 의존성 모킹
jest.mock('../database', () => ({
  teamService: {
    findByAnyName: jest.fn(),
    findByNormalizedName: jest.fn(),
    searchTeams: jest.fn(),
    createTeam: jest.fn(),
    addAlias: jest.fn(),
    findActiveTeams: jest.fn(),
    model: {
      findUnique: jest.fn()
    }
  }
}));

jest.mock('../../utils/logger');

describe('TeamNormalizationService', () => {
  let service: TeamNormalizationService;

  beforeEach(() => {
    service = new TeamNormalizationService();
    jest.clearAllMocks();
  });

  describe('normalizeTeamName', () => {
    it('should return existing team info for exact match', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '도쿄 라이온즈',
        sportType: SportType.SOCCER
      };

      const mockAliases = {
        teamAliases: [
          { alias: '도쿄 라이온즈' },
          { alias: '도쿄Lions' }
        ]
      };

      (teamService.findByAnyName as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.model.findUnique as jest.Mock).mockResolvedValue(mockAliases);

      const result = await service.normalizeTeamName('도쿄 라이온즈');

      expect(result).toEqual({
        normalizedName: '도쿄 라이온즈',
        originalName: '도쿄 라이온즈',
        isExistingTeam: true,
        teamId: '1',
        variations: ['도쿄 라이온즈', '도쿄Lions']
      });
    });

    it('should clean team name before matching', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      (teamService.findByAnyName as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.model.findUnique as jest.Mock).mockResolvedValue({
        teamAliases: []
      });

      await service.normalizeTeamName('도쿄 라이온즈입니다');

      expect(teamService.findByAnyName).toHaveBeenCalledWith('도쿄 라이온즈');
    });

    it('should find similar team when no exact match', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '오사카 타이거스'
      };

      (teamService.findByAnyName as jest.Mock).mockResolvedValue(null);
      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: [mockTeam]
      });
      (teamService.searchTeams as jest.Mock).mockResolvedValue([]);
      (teamService.model.findUnique as jest.Mock).mockResolvedValue({
        teamAliases: [{ alias: '오사카 타이거스' }]
      });

      // '오사카 타이거'와 '오사카 타이거스' 사이의 유사도는 충분히 높아야 함
      const result = await service.normalizeTeamName('오사카 타이거스');

      // 유사한 팀을 찾아야 함
      expect(result.isExistingTeam).toBe(true);
      expect(result.normalizedName).toBe('오사카 타이거스');
    });

    it('should create normalized name for new team', async () => {
      (teamService.findByAnyName as jest.Mock).mockResolvedValue(null);
      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: []
      });
      (teamService.searchTeams as jest.Mock).mockResolvedValue([]);

      const result = await service.normalizeTeamName('tokyo eagles');

      expect(result).toEqual({
        normalizedName: 'Tokyo Eagles',
        originalName: 'tokyo eagles',
        isExistingTeam: false
      });
    });

    it('should convert full-width to half-width characters', async () => {
      (teamService.findByAnyName as jest.Mock).mockResolvedValue(null);
      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: []
      });
      (teamService.searchTeams as jest.Mock).mockResolvedValue([]);

      const result = await service.normalizeTeamName('Ｔｏｋｙｏ　Ｔｉｇｅｒｓ');

      expect(result.normalizedName).toBe('Tokyo Tigers');
    });
  });

  describe('addTeamVariation', () => {
    it('should add variation to existing team', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      const mockAlias = {
        id: 'a1',
        teamId: '1',
        alias: '새로운 별명'
      };

      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.addAlias as jest.Mock).mockResolvedValue(mockAlias);
      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: []
      });

      const result = await service.addTeamVariation('도쿄 라이온즈', '새로운 별명');

      expect(teamService.addAlias).toHaveBeenCalledWith('1', '새로운 별명');
      expect(result).toBe(true);
    });

    it('should return false if team not found', async () => {
      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(null);

      const result = await service.addTeamVariation('존재하지 않는 팀', '별명');

      expect(teamService.addAlias).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return false if alias already exists', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.addAlias as jest.Mock).mockResolvedValue(null);

      const result = await service.addTeamVariation('도쿄 라이온즈', '기존 별명');

      expect(result).toBe(false);
    });
  });

  describe('registerNewTeam', () => {
    it('should create new team', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '요코하마 베이스타즈',
        sportType: SportType.BASEBALL
      };

      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(null);
      (teamService.createTeam as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: []
      });

      const result = await service.registerNewTeam(
        '요코하마 베이스타즈',
        ['요코하마Baystars'],
        'BASEBALL'
      );

      expect(teamService.createTeam).toHaveBeenCalledWith(
        {
          normalizedName: '요코하마 베이스타즈',
          sportType: 'BASEBALL'
        },
        ['요코하마Baystars']
      );
      expect(result).toEqual(mockTeam);
    });

    it('should return existing team if already exists', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(mockTeam);

      const result = await service.registerNewTeam('도쿄 라이온즈');

      expect(teamService.createTeam).not.toHaveBeenCalled();
      expect(result).toEqual(mockTeam);
    });

    it('should handle creation errors', async () => {
      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(null);
      (teamService.createTeam as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await service.registerNewTeam('새 팀');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('areSameTeam', () => {
    it('should return true for same normalized names', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      (teamService.findByAnyName as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.model.findUnique as jest.Mock).mockResolvedValue({
        teamAliases: []
      });

      const result = await service.areSameTeam('도쿄 라이온즈', '도쿄Lions');

      expect(result).toBe(true);
    });

    it('should return false for different teams', async () => {
      const mockTeam1 = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      const mockTeam2 = {
        id: '2',
        normalizedName: '오사카 타이거스'
      };

      (teamService.findByAnyName as jest.Mock)
        .mockResolvedValueOnce(mockTeam1)
        .mockResolvedValueOnce(mockTeam2);

      (teamService.model.findUnique as jest.Mock).mockResolvedValue({
        teamAliases: []
      });

      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: []
      });

      const result = await service.areSameTeam('도쿄 라이온즈', '오사카 타이거스');

      expect(result).toBe(false);
    });
  });

  describe('getAllNormalizedTeamNames', () => {
    it('should return all team names', async () => {
      const mockTeams = [
        { normalizedName: '도쿄 라이온즈' },
        { normalizedName: '오사카 타이거스' },
        { normalizedName: '나고야 드래곤즈' }
      ];

      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: mockTeams
      });

      const result = await service.getAllNormalizedTeamNames();

      expect(result).toEqual([
        '도쿄 라이온즈',
        '오사카 타이거스',
        '나고야 드래곤즈'
      ]);
    });

    it('should handle errors and return empty array', async () => {
      (teamService.findActiveTeams as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );

      const result = await service.getAllNormalizedTeamNames();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getTeamVariations', () => {
    it('should return team variations', async () => {
      const mockTeam = {
        id: '1',
        normalizedName: '東京ライオンズ'
      };

      const mockAliases = {
        teamAliases: [
          { alias: '도쿄 라이온즈' },
          { alias: '도쿄Lions' },
          { alias: '도쿄라이온즈' }
        ]
      };

      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(mockTeam);
      (teamService.model.findUnique as jest.Mock).mockResolvedValue(mockAliases);

      const result = await service.getTeamVariations('도쿄 라이온즈');

      expect(result).toEqual([
        '도쿄 라이온즈',
        '도쿄Lions',
        '도쿄라이온즈'
      ]);
    });

    it('should return null if team not found', async () => {
      (teamService.findByNormalizedName as jest.Mock).mockResolvedValue(null);

      const result = await service.getTeamVariations('존재하지 않는 팀');

      expect(result).toBeNull();
    });
  });

  describe('helper methods', () => {
    it('should calculate similarity correctly', () => {
      // 정규화 프로세스를 통해 유사도 계산을 간접적으로 테스트
      expect(service['calculateSimilarity']('도쿄', '도쿄')).toBe(1);
      expect(service['calculateSimilarity']('도쿄', '오사카')).toBeLessThan(0.5);
      expect(service['calculateSimilarity']('ABC', 'ABCD')).toBeGreaterThan(0.7);
    });

    it('should convert hiragana to katakana', () => {
      expect(service['toKatakana']('あいうえお')).toBe('アイウエオ');
      expect(service['toKatakana']('らいおんず')).toBe('ライオンズ');
      expect(service['toKatakana']('ライオンズ')).toBe('ライオンズ'); // 이미 카타카나
    });

    it('should clean team names properly', () => {
      expect(service['cleanTeamName']('도쿄 라이온즈입니다')).toBe('도쿄 라이온즈');
      expect(service['cleanTeamName']('도쿄  라이온즈  ')).toBe('도쿄 라이온즈');
      expect(service['cleanTeamName']('「도쿄 라이온즈」')).toBe('도쿄 라이온즈');
      expect(service['cleanTeamName']('도쿄 라이온즈FC')).toBe('도쿄 라이온즈');
      expect(service['cleanTeamName']('도쿄 라이온즈팀')).toBe('도쿄 라이온즈');
    });

    it('should create normalized names properly', () => {
      expect(service['createNormalizedName']('tokyo lions')).toBe('Tokyo Lions');
      expect(service['createNormalizedName']('TOKYO LIONS')).toBe('TOKYO LIONS');
      expect(service['createNormalizedName']('Ｔｏｋｙｏ　Ｌｉｏｎｓ')).toBe('Tokyo Lions');
      expect(service['createNormalizedName']('  tokyo  lions  ')).toBe('Tokyo Lions');
    });
  });

  describe('cache management', () => {
    it('should refresh cache when expired', async () => {
      const mockTeams = [
        { id: '1', normalizedName: '도쿄 라이온즈' },
        { id: '2', normalizedName: '오사카 타이거스' }
      ];

      (teamService.findActiveTeams as jest.Mock).mockResolvedValue({
        data: mockTeams
      });

      // 마지막 캐시 업데이트를 과거로 설정
      service['lastCacheUpdate'] = Date.now() - 10 * 60 * 1000; // 10분 전

      await service['updateCacheIfNeeded']();

      expect(teamService.findActiveTeams).toHaveBeenCalledWith({ limit: 1000 });
      expect(service['teamCache'].size).toBe(2);
    });

    it('should not refresh cache if not expired', async () => {
      service['lastCacheUpdate'] = Date.now() - 1000; // 1초 전

      await service['updateCacheIfNeeded']();

      expect(teamService.findActiveTeams).not.toHaveBeenCalled();
    });

    it('should handle cache refresh errors', async () => {
      service['lastCacheUpdate'] = 0; // 강제 새로고침

      (teamService.findActiveTeams as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );

      await service['updateCacheIfNeeded']();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to refresh team cache',
        expect.any(Error)
      );
    });
  });
});