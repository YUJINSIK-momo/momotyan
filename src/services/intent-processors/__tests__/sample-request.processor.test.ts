import { SampleRequestProcessor } from '../sample-request.processor';
import { ProcessorContext } from '../base.processor';
import { customerJourneyService } from '../../database';
import { CustomerJourneyStage } from '../../../generated/prisma';

// Mock dependencies
jest.mock('../../database');

describe('SampleRequestProcessor', () => {
  let processor: SampleRequestProcessor;
  let mockContext: ProcessorContext;

  beforeEach(() => {
    processor = new SampleRequestProcessor();

    mockContext = {
      userId: 'test-user',
      message: '샘플 요청하고 싶어요',
      conversationId: 'test-conversation',
      intent: {
        intentName: 'sample.request',
        confidence: 0.9,
        parameters: {},
        queryText: '샘플 요청하고 싶어요',
        allRequiredParamsPresent: true
      },
      customer: {
        id: 'test-customer-id',
        lineUserId: 'test-user',
        lineUserName: '홍길동',
        brand: 'ILB_MAX',
        teamName: '서울 이글스',
        sportType: 'BASEBALL',
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
    it('should process sample request for ILB_MAX brand successfully', async () => {
      // Mock customer journey service
      (customerJourneyService.updateJourneyStage as jest.Mock).mockResolvedValue(undefined);

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('홍길동님, 안녕하세요!');
      expect(result.message).toContain('ILB-MAX 야구 유니폼');
      expect(result.message).toContain('https://forms.gle/ilb-max-sample-form');
      expect(result.metadata?.requiresApproval).toBe(false);
      expect(result.metadata?.automationLevel).toBe(100);
      expect(result.metadata?.brand).toBe('ILB_MAX');

      // Verify journey stage update
      expect(customerJourneyService.updateJourneyStage).toHaveBeenCalledWith(
        'test-customer-id',
        CustomerJourneyStage.SAMPLE_REQUESTED
      );
    });

    it('should process sample request for MAX2MAX brand successfully', async () => {
      if (mockContext.customer) {
        mockContext.customer.brand = 'MAX2MAX';
      }

      (customerJourneyService.updateJourneyStage as jest.Mock).mockResolvedValue(undefined);

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('MAX2MAX 축구/농구 유니폼');
      expect(result.message).toContain('https://forms.gle/max2max-sample-form');
      expect(result.metadata?.brand).toBe('MAX2MAX');
    });

    it('should handle customer without brand', async () => {
      if (mockContext.customer) {
        mockContext.customer.brand = null;
        mockContext.customer.lineUserName = null;
      }

      (customerJourneyService.updateJourneyStage as jest.Mock).mockResolvedValue(undefined);

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('고객님, 안녕하세요!');
      expect(result.message).toContain('https://forms.gle/kalron-sample-form');
      expect(result.metadata?.brand).toBeNull();
    });

    it('should handle customer without customer info', async () => {
      mockContext.customer = undefined;

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('고객님, 안녕하세요!');
      expect(result.message).toContain('https://forms.gle/kalron-sample-form');

      // Should not call journey service when no customer
      expect(customerJourneyService.updateJourneyStage).not.toHaveBeenCalled();
    });

    it('should handle journey update errors gracefully', async () => {
      // Mock journey service to throw error
      (customerJourneyService.updateJourneyStage as jest.Mock).mockRejectedValue(
        new Error('Journey update failed')
      );

      const result = await processor.process(mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('죄송합니다. 샘플 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    });

    it('should include all required sample request information', async () => {
      (customerJourneyService.updateJourneyStage as jest.Mock).mockResolvedValue(undefined);

      const result = await processor.process(mockContext);

      expect(result.message).toContain('샘플 신청 방법');
      expect(result.message).toContain('샘플 신청 폼');
      expect(result.message).toContain('신청 시 필요한 정보');
      expect(result.message).toContain('팀명');
      expect(result.message).toContain('연락처');
      expect(result.message).toContain('배송 주소');
      expect(result.message).toContain('배송 안내');
      expect(result.message).toContain('2-3일 내 발송');
      expect(result.message).toContain('무료 배송');
    });
  });

  describe('gatherContext', () => {
    it('should return basic context data', async () => {
      const result = await (processor as unknown as { gatherContext: (ctx: ProcessorContext) => Promise<Record<string, unknown>> }).gatherContext(mockContext);

      expect(result).toEqual({
        responseType: 'sample_form_link'
      });
    });
  });

  describe('getSampleFormUrl', () => {
    it('should return correct URL for ILB_MAX', () => {
      const url = (processor as unknown as { getSampleFormUrl: (brand?: string | null) => string }).getSampleFormUrl('ILB_MAX');
      expect(url).toBe('https://forms.gle/ilb-max-sample-form');
    });

    it('should return correct URL for MAX2MAX', () => {
      const url = (processor as unknown as { getSampleFormUrl: (brand?: string | null) => string }).getSampleFormUrl('MAX2MAX');
      expect(url).toBe('https://forms.gle/max2max-sample-form');
    });

    it('should return default URL for unknown brand', () => {
      const url = (processor as unknown as { getSampleFormUrl: (brand?: string | null) => string }).getSampleFormUrl('UNKNOWN');
      expect(url).toBe('https://forms.gle/kalron-sample-form');
    });

    it('should return default URL for null brand', () => {
      const url = (processor as unknown as { getSampleFormUrl: (brand?: string | null) => string }).getSampleFormUrl(null);
      expect(url).toBe('https://forms.gle/kalron-sample-form');
    });
  });
});