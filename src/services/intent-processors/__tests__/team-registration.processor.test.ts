import { TeamRegistrationProcessor } from '../team-registration.processor';
import { ProcessorContext } from '../base.processor';
import { SportType } from '../../../generated/prisma';

// Mock all dependencies
jest.mock('../../database');
jest.mock('../../team-normalization');
jest.mock('../../llm');
jest.mock('../../conversation-context');

describe('TeamRegistrationProcessor - Simple Tests', () => {
  let processor: TeamRegistrationProcessor;
  let mockContext: ProcessorContext;

  beforeEach(() => {
    processor = new TeamRegistrationProcessor();

    mockContext = {
      userId: 'test-user',
      message: '우리는 서울 이글스입니다',
      conversationId: 'test-conversation',
      intent: {
        intentName: 'team.registration',
        confidence: 0.9,
        parameters: { team_name: '서울 이글스' },
        queryText: '우리는 서울 이글스입니다',
        allRequiredParamsPresent: true
      },
      customer: {
        id: 'test-customer-id',
        lineUserId: 'test-user',
        lineUserName: '홍길동',
        brand: 'ILB_MAX',
        teamName: null,
        sportType: null,
        friendAddDate: new Date(),
        firstChatDate: new Date(),
        customerType: 'NEW',
        lastMessageDate: new Date(),
        friendAddStatus: 'FRIEND',
        chatStatus: 'CHATTING',
        blockDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        agentAssigned: null,
        notes: null
      }
    };

    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should handle missing customer error', async () => {
      mockContext.customer = undefined;

      const result = await processor.process(mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('죄송합니다. 고객 정보를 찾을 수 없습니다. 다시 시도해 주세요.');
    });

    it('should call baseProcess when customer exists', async () => {
      const baseProcessSpy = jest.spyOn(processor as unknown as { baseProcess: jest.Mock }, 'baseProcess');
      baseProcessSpy.mockResolvedValue({
        success: true,
        message: '테스트 응답'
      });

      const result = await processor.process(mockContext);

      expect(baseProcessSpy).toHaveBeenCalledWith(mockContext);
      expect(result.success).toBe(true);
      expect(result.message).toBe('테스트 응답');
    });
  });

  describe('gatherContext', () => {
    it('should gather context data correctly', async () => {
      const result = await (processor as unknown as { gatherContext: (ctx: ProcessorContext) => Promise<Record<string, unknown>> }).gatherContext(mockContext);

      expect(result).toEqual({
        brand: 'ILB_MAX',
        customerName: '홍길동',
        existingTeamName: null,
        extractedTeamName: '서울 이글스',
        sportType: null
      });
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt for ILB_MAX brand', () => {
      const gatheredData = { brand: 'ILB_MAX', extractedTeamName: '서울 이글스' };

      const prompt = (processor as unknown as { buildPrompt: (ctx: ProcessorContext, data: Record<string, unknown>) => string }).buildPrompt(mockContext, gatheredData);

      expect(prompt).toContain('브랜드: ILB-MAX (야구 유니폼 전문)');
      expect(prompt).toContain('고객 메시지: "우리는 서울 이글스입니다"');
      expect(prompt).toContain('참고: 시스템이 추출한 팀명은 "서울 이글스"입니다.');
      expect(prompt).toContain('[TEAM_NAME:팀이름] 형식으로 표시');
    });

    it('should build prompt for MAX2MAX brand', () => {
      const gatheredData = { brand: 'MAX2MAX' };

      const prompt = (processor as unknown as { buildPrompt: (ctx: ProcessorContext, data: Record<string, unknown>) => string }).buildPrompt(mockContext, gatheredData);

      expect(prompt).toContain('브랜드: MAX2MAX (축구/농구 유니폼)');
    });
  });

  describe('determineSportType', () => {
    it('should return BASEBALL for ILB_MAX brand', () => {
      const result = (processor as unknown as { determineSportType: (brand: string, teamName: string) => SportType | null }).determineSportType('ILB_MAX', '서울 이글스');
      expect(result).toBe(SportType.BASEBALL);
    });

    it('should return SOCCER for FC team in MAX2MAX', () => {
      const result = (processor as unknown as { determineSportType: (brand: string, teamName: string) => SportType | null }).determineSportType('MAX2MAX', '서울 FC');
      expect(result).toBe(SportType.SOCCER);
    });

    it('should return BASKETBALL for basketball keywords in MAX2MAX', () => {
      const result = (processor as unknown as { determineSportType: (brand: string, teamName: string) => SportType | null }).determineSportType('MAX2MAX', '서울 농구팀');
      expect(result).toBe(SportType.BASKETBALL);
    });

    it('should return null for unknown brand', () => {
      const result = (processor as unknown as { determineSportType: (brand: string, teamName: string) => SportType | null }).determineSportType('UNKNOWN', '팀명');
      expect(result).toBeNull();
    });
  });
});