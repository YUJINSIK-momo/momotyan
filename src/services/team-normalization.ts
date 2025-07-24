import logger from '../utils/logger';
import { teamService } from './database';
import { Team, TeamAlias, SportType } from '../generated/prisma';

/**
 * 팀 이름 정규화 서비스
 * LLM이 추출한 팀명을 표준화된 형태로 변환합니다.
 */

interface NormalizedTeamInfo {
  normalizedName: string;
  originalName: string;
  isExistingTeam: boolean;
  teamId?: string;
  variations?: string[];
}

export class TeamNormalizationService {
  // 캐시 (성능 최적화)
  private teamCache: Map<string, Team> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5분
  private lastCacheUpdate: number = 0;

  /**
   * LLM이 추출한 팀명을 정규화합니다.
   * @param extractedTeamName LLM이 추출한 팀명
   * @returns 정규화된 팀 정보
   */
  async normalizeTeamName(extractedTeamName: string): Promise<NormalizedTeamInfo> {
    const cleanedName = this.cleanTeamName(extractedTeamName);

    // 캐시 업데이트 확인
    await this.updateCacheIfNeeded();

    // 1. 정확한 매칭 확인 (정규화된 이름 또는 별칭)
    const exactMatch = await teamService.findByAnyName(cleanedName);
    if (exactMatch) {
      const aliases = await this.getTeamAliases(exactMatch.id);
      return {
        normalizedName: exactMatch.normalizedName,
        originalName: extractedTeamName,
        isExistingTeam: true,
        teamId: exactMatch.id,
        variations: aliases
      };
    }

    // 2. 캐시된 팀들과 유사도 매칭
    const similarTeam = await this.findSimilarTeam(cleanedName);
    if (similarTeam) {
      const aliases = await this.getTeamAliases(similarTeam.id);
      return {
        normalizedName: similarTeam.normalizedName,
        originalName: extractedTeamName,
        isExistingTeam: true,
        teamId: similarTeam.id,
        variations: aliases
      };
    }

    // 3. 매칭되는 기존 팀이 없으면 새로운 팀으로 처리
    const normalized = this.createNormalizedName(cleanedName);
    return {
      normalizedName: normalized,
      originalName: extractedTeamName,
      isExistingTeam: false
    };
  }

  /**
   * 팀명을 정리합니다.
   */
  private cleanTeamName(teamName: string): string {
    return teamName
      .trim()
      .replace(/\s+/g, ' ')  // 연속된 공백을 하나로
      .replace(/[「」『』""'']/g, '') // 불필요한 따옴표 제거
      .replace(/チーム$|team$/i, '') // 일반적인 접미사 제거
      .replace(/FC$|SC$/i, '') // 축구 팀 접미사 제거
      .replace(/です$|だ$|ます$/, ''); // 일본어 정중어 제거
  }

  /**
   * 캐시를 업데이트합니다.
   */
  private async updateCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.cacheTimeout) {
      await this.refreshCache();
    }
  }

  /**
   * 캐시를 새로고침합니다.
   */
  private async refreshCache(): Promise<void> {
    try {
      const teams = await teamService.findActiveTeams({ limit: 1000 });
      this.teamCache.clear();

      teams.data.forEach(team => {
        this.teamCache.set(team.normalizedName, team);
      });

      this.lastCacheUpdate = Date.now();
      logger.info('Team cache refreshed', { teamCount: teams.data.length });
    } catch (error) {
      logger.error('Failed to refresh team cache', error);
    }
  }

  /**
   * 팀의 모든 별칭을 가져옵니다.
   */
  private async getTeamAliases(teamId: string): Promise<string[]> {
    try {
      const actualTeam = await teamService.model.findUnique({
        where: { id: teamId },
        include: { teamAliases: true }
      });

      if (!actualTeam || !actualTeam.teamAliases) {
        return [];
      }

      return actualTeam.teamAliases.map((alias: TeamAlias) => alias.alias);
    } catch (error) {
      logger.error('Failed to get team aliases', error);
      return [];
    }
  }

  /**
   * 유사한 팀을 찾습니다.
   */
  private async findSimilarTeam(cleanedName: string): Promise<Team | null> {
    let bestMatch: Team | null = null;
    let highestSimilarity = 0;
    const threshold = 0.7;

    // 캐시된 팀들과 비교
    for (const team of this.teamCache.values()) {
      const similarity = this.calculateSimilarity(cleanedName, team.normalizedName);

      if (similarity > threshold && similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = team;
      }
    }

    // 별칭과도 비교
    if (!bestMatch) {
      const searchResults = await teamService.searchTeams(cleanedName, 10);

      for (const team of searchResults) {
        const aliases = await this.getTeamAliases(team.id);

        for (const alias of aliases) {
          const similarity = this.calculateSimilarity(cleanedName, alias);

          if (similarity > threshold && similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestMatch = team;
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * 두 문자열의 유사도를 계산합니다.
   * Levenshtein 거리 기반
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    return 1 - (distance / maxLength);
  }

  /**
   * Levenshtein 거리를 계산합니다.
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // 삭제
            dp[i][j - 1] + 1,    // 삽입
            dp[i - 1][j - 1] + 1 // 치환
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 히라가나를 가타카나로 변환합니다.
   */
  private toKatakana(str: string): string {
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) + 0x60);
    });
  }

  /**
   * 새로운 팀의 정규화된 이름을 생성합니다.
   */
  private createNormalizedName(teamName: string): string {
    let normalized = teamName;

    // 전각 영문자를 반각으로 변환
    normalized = normalized.replace(/[Ａ-Ｚａ-ｚ]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });

    // 전각 공백을 반각으로 변환
    // eslint-disable-next-line no-irregular-whitespace
    normalized = normalized.replace(/　/g, ' ');

    // 연속된 공백을 하나로
    normalized = normalized.replace(/\s+/g, ' ');

    // 영어 단어의 첫 글자를 대문자로
    normalized = normalized.replace(/\b[a-z]/g, (l) => l.toUpperCase());

    // 불필요한 공백 제거
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * 기존 팀에 새로운 변형을 추가합니다.
   */
  async addTeamVariation(normalizedName: string, newVariation: string): Promise<boolean> {
    try {
      const team = await teamService.findByNormalizedName(normalizedName);
      if (!team) {
        logger.warn('Team not found for variation', { normalizedName });
        return false;
      }

      const result = await teamService.addAlias(team.id, newVariation);

      if (result) {
        // 캐시 업데이트
        await this.refreshCache();
        logger.info('Added new team variation', {
          team: normalizedName,
          variation: newVariation
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to add team variation', error);
      return false;
    }
  }

  /**
   * 새로운 팀을 데이터베이스에 등록합니다.
   */
  async registerNewTeam(
    teamName: string,
    variations: string[] = [],
    sportType?: string
  ): Promise<Team | null> {
    try {
      const normalizedName = this.createNormalizedName(teamName);

      // 이미 존재하는지 확인
      const existing = await teamService.findByNormalizedName(normalizedName);
      if (existing) {
        logger.info('Team already exists', { normalizedName });
        return existing;
      }

      const team = await teamService.createTeam(
        {
          normalizedName,
          sportType: sportType as SportType
        },
        variations
      );

      // 캐시 업데이트
      await this.refreshCache();

      logger.info('Registered new team', {
        normalizedName,
        variations,
        sportType
      });

      return team;
    } catch (error) {
      logger.error('Failed to register new team', error);
      return null;
    }
  }

  /**
   * 두 팀명이 같은 팀을 가리키는지 확인합니다.
   */
  async areSameTeam(teamName1: string, teamName2: string): Promise<boolean> {
    const normalized1 = await this.normalizeTeamName(teamName1);
    const normalized2 = await this.normalizeTeamName(teamName2);

    return normalized1.normalizedName === normalized2.normalizedName;
  }

  /**
   * 모든 등록된 팀의 정규화된 이름을 반환합니다.
   */
  async getAllNormalizedTeamNames(): Promise<string[]> {
    try {
      const teams = await teamService.findActiveTeams({ limit: 1000 });
      return teams.data.map(team => team.normalizedName);
    } catch (error) {
      logger.error('Failed to get all team names', error);
      return [];
    }
  }

  /**
   * 특정 팀의 모든 변형을 반환합니다.
   */
  async getTeamVariations(normalizedName: string): Promise<string[] | null> {
    try {
      const team = await teamService.findByNormalizedName(normalizedName);
      if (!team) {
        return null;
      }

      return await this.getTeamAliases(team.id);
    } catch (error) {
      logger.error('Failed to get team variations', error);
      return null;
    }
  }
}

export const teamNormalizationService = new TeamNormalizationService();