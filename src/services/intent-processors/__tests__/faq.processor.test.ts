import { FAQProcessor } from '../faq.processor';
import { ProcessorContext } from '../base.processor';

describe('FAQProcessor', () => {
  let processor: FAQProcessor;
  let mockContext: ProcessorContext;

  beforeEach(() => {
    processor = new FAQProcessor();

    mockContext = {
      userId: 'test-user',
      message: '연락처 알려주세요',
      conversationId: 'test-conversation',
      intent: {
        intentName: 'contact.info',
        confidence: 0.9,
        parameters: {},
        queryText: '연락처 알려주세요',
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
    it('should process contact info request successfully', async () => {
      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 고객센터 연락처');
      expect(result.message).toContain('02-1234-5678');
      expect(result.message).toContain('support@kalron.co.kr');
      expect(result.message).toContain('ILB-MAX 야구 전문');
      expect(result.metadata?.requiresApproval).toBe(false);
      expect(result.metadata?.automationLevel).toBe(100);
      expect(result.metadata?.category).toBe('contact');
    });

    it('should process business hours request', async () => {
      mockContext.intent.intentName = 'business.hours';

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 영업시간 안내');
      expect(result.message).toContain('월~금요일: 09:00 ~ 18:00');
      expect(result.message).toContain('LINE 채팅 상담');
      expect(result.metadata?.category).toBe('hours');
    });

    it('should process material info request', async () => {
      mockContext.intent.intentName = 'material.info';

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 유니폼 재질 정보');
      expect(result.message).toContain('야구 유니폼 (ILB-MAX)');
      expect(result.message).toContain('폴리에스터');
      expect(result.metadata?.category).toBe('material');
    });

    it('should process size guide request', async () => {
      mockContext.intent.intentName = 'size.guide';

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 유니폼 사이즈 가이드');
      expect(result.message).toContain('상의 사이즈');
      expect(result.message).toContain('가슴둘레 기준');
      expect(result.metadata?.category).toBe('size');
    });

    it('should process shipping policy request', async () => {
      mockContext.intent.intentName = 'shipping.policy';

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 배송 정책 안내');
      expect(result.message).toContain('50벌 이상: 무료 배송');
      expect(result.message).toContain('제작 기간: 7~10일');
      expect(result.metadata?.category).toBe('shipping');
    });

    it('should process refund policy request', async () => {
      mockContext.intent.intentName = 'refund.policy';

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 환불/교환 정책');
      expect(result.message).toContain('제작 전 주문 취소: 100% 환불');
      expect(result.message).toContain('환불 불가 조건');
      expect(result.metadata?.category).toBe('refund');
    });

    it('should handle MAX2MAX brand context', async () => {
      if (mockContext.customer) {
        mockContext.customer.brand = 'MAX2MAX';
      }

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('MAX2MAX 축구/농구 전문');
    });

    it('should handle customer without brand', async () => {
      if (mockContext.customer) {
        mockContext.customer.brand = null;
      }

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 고객센터');
      expect(result.message).not.toContain('ILB-MAX');
      expect(result.message).not.toContain('MAX2MAX');
    });

    it('should handle unknown intent with general help', async () => {
      mockContext.intent.intentName = 'unknown.intent';

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('무엇을 도와드릴까요?');
      expect(result.message).toContain('연락처 문의');
      expect(result.message).toContain('영업시간 문의');
      expect(result.metadata?.category).toBe('general');
    });

    it('should handle customer without customer info', async () => {
      mockContext.customer = undefined;

      const result = await processor.process(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kalron 고객센터');
      expect(result.message).not.toContain('전문 브랜드');
    });
  });

  describe('gatherContext', () => {
    it('should return basic context data', async () => {
      const result = await (processor as unknown as { gatherContext: (ctx: ProcessorContext) => Promise<Record<string, unknown>> }).gatherContext(mockContext);

      expect(result).toEqual({
        responseType: 'static_faq'
      });
    });
  });

  describe('FAQ categories', () => {
    it('should categorize FAQ intents correctly', () => {
      const getFAQCategory = (processor as unknown as { getFAQCategory: (intent: string) => string }).getFAQCategory;

      expect(getFAQCategory('contact.info')).toBe('contact');
      expect(getFAQCategory('business.hours')).toBe('hours');
      expect(getFAQCategory('material.info')).toBe('material');
      expect(getFAQCategory('size.guide')).toBe('size');
      expect(getFAQCategory('shipping.policy')).toBe('shipping');
      expect(getFAQCategory('refund.policy')).toBe('refund');
      expect(getFAQCategory('unknown.intent')).toBe('general');
    });
  });
});