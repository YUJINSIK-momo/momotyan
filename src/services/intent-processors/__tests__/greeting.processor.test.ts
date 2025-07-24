import { GreetingProcessor } from '../greeting.processor';
import { ProcessorContext } from '../base.processor';
import { customerTeamService, customerJourneyService } from '../../database';
import { CustomerJourneyStage } from '../../../generated/prisma';

jest.mock('../../database');

describe('GreetingProcessor', () => {
  let processor: GreetingProcessor;
  let mockContext: ProcessorContext;

  beforeEach(() => {
    processor = new GreetingProcessor();
    mockContext = {
      userId: 'test-user',
      message: '안녕하세요',
      conversationId: 'test-conversation',
      intent: {
        intentName: 'greeting',
        confidence: 0.9,
        parameters: {},
        queryText: '안녕하세요',
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

      expect(result.message).toBe('죄송합니다. 시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      expect(result.success).toBe(false);
      expect(result.metadata?.requiresApproval).toBe(false);
    });

    it('should update journey stage to FIRST_MESSAGE', async () => {
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([]);

      await processor.process(mockContext);

      expect(customerJourneyService.updateJourneyStage).toHaveBeenCalledWith(
        'test-customer-id',
        CustomerJourneyStage.FIRST_MESSAGE
      );
    });

    it('should request team name when customer has no team info', async () => {
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([]);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('홍길동님, 안녕하세요!');
      expect(result.message).toContain('팀 이름을 알려주시겠어요?');
      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        requiresApproval: false,
        hasTeamInfo: false,
        needsTeamRegistration: true,
        brand: 'ILB_MAX'
      });
    });

    it('should welcome back customer with team info', async () => {
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([
        { teamName: '서울 이글스', isActive: true }
      ]);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('서울 이글스 팀의 홍길동님');
      expect(result.message).toContain('다시 찾아주셔서 감사합니다!');
      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        requiresApproval: false,
        hasTeamInfo: true,
        teams: ['서울 이글스'],
        brand: 'ILB_MAX'
      });
    });

    it('should handle multiple teams', async () => {
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([
        { teamName: '서울 이글스', isActive: true },
        { teamName: '부산 타이거즈', isActive: true }
      ]);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('서울 이글스, 부산 타이거즈 팀의');
      expect(result.metadata?.teams).toEqual(['서울 이글스', '부산 타이거즈']);
    });

    it('should use legacy teamName if present', async () => {
      if (mockContext.customer) {
        mockContext.customer.teamName = '레거시 팀';
      }
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([]);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('레거시 팀 팀의');
      expect(result.metadata?.teams).toEqual(['레거시 팀']);
    });

    it('should handle MAX2MAX brand correctly', async () => {
      if (mockContext.customer) {
        mockContext.customer.brand = 'MAX2MAX';
      }
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([]);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('MAX2MAX 스포츠 유니폼');
    });

    it('should handle missing brand', async () => {
      if (mockContext.customer) {
        mockContext.customer.brand = null;
      }
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([]);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('Kalron 스포츠 유니폼');
    });

    it('should handle journey stage update error gracefully', async () => {
      (customerTeamService.findByCustomerId as jest.Mock).mockResolvedValue([]);
      (customerJourneyService.updateJourneyStage as jest.Mock).mockRejectedValue(
        new Error('Update failed')
      );

      const result = await processor.process(mockContext);

      // Should continue processing despite error
      expect(result.message).toContain('팀 이름을 알려주시겠어요?');
    });
  });
});