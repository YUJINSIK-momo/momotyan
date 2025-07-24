import { SlackChannelRouter, ChannelRoutingContext } from '../slack-channel-router';
import { SportType, IntentCategory } from '../../generated/prisma';

describe('SlackChannelRouter', () => {
  let router: SlackChannelRouter;
  const mockChannelConfig = {
    baseball: 'C1111111111',
    soccer: 'C2222222222',
    basketball: 'C3333333333',
    design: 'C4444444444',
    claim: 'C5555555555',
    sample: 'C6666666666',
    payment: 'C7777777777',
    default: 'C8888888888'
  };

  beforeEach(() => {
    router = new SlackChannelRouter(mockChannelConfig);
  });

  describe('getChannel', () => {
    it('should route to claim channel for claim-related intent', () => {
      const context: ChannelRoutingContext = {
        intentCategory: IntentCategory.CLAIM
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.claim);
    });

    it('should route to design channel for design-related intent', () => {
      const context: ChannelRoutingContext = {
        intentCategory: IntentCategory.DESIGN_INQUIRY
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.design);
    });

    it('should route to sample channel for sample request', () => {
      const context: ChannelRoutingContext = {
        intentCategory: IntentCategory.SAMPLE_REQUEST
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.sample);
    });

    it('should route to payment channel for payment-related intent', () => {
      const context: ChannelRoutingContext = {
        intentCategory: IntentCategory.PAYMENT_DELIVERY
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.payment);
    });

    it('should route to baseball channel for baseball sport type', () => {
      const context: ChannelRoutingContext = {
        sportType: SportType.BASEBALL
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.baseball);
    });

    it('should route to soccer channel for soccer sport type', () => {
      const context: ChannelRoutingContext = {
        sportType: SportType.SOCCER
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.soccer);
    });

    it('should route to basketball channel for basketball sport type', () => {
      const context: ChannelRoutingContext = {
        sportType: SportType.BASKETBALL
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.basketball);
    });

    it('should route to baseball channel for ILB_MAX brand', () => {
      const context: ChannelRoutingContext = {
        brand: 'ILB_MAX'
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.baseball);
    });

    it('should route to default channel when no specific routing applies', () => {
      const context: ChannelRoutingContext = {};
      expect(router.getChannel(context)).toBe(mockChannelConfig.default);
    });

    it('should prioritize special purpose channels over sport channels', () => {
      const context: ChannelRoutingContext = {
        sportType: SportType.BASEBALL,
        intentCategory: IntentCategory.DESIGN_INQUIRY
      };
      expect(router.getChannel(context)).toBe(mockChannelConfig.design);
    });

    it('should handle missing channel configuration gracefully', () => {
      const minimalConfig = {
        default: 'C9999999999'
      };
      const minimalRouter = new SlackChannelRouter(minimalConfig);
      const context: ChannelRoutingContext = {
        sportType: SportType.BASEBALL
      };
      expect(minimalRouter.getChannel(context)).toBe(minimalConfig.default);
    });
  });

  describe('getChannelName', () => {
    it('should return correct display name for baseball channel', () => {
      expect(router.getChannelName(mockChannelConfig.baseball)).toBe('#아구ILB-MAX');
    });

    it('should return correct display name for soccer channel', () => {
      expect(router.getChannelName(mockChannelConfig.soccer)).toBe('#축구MAX2MAX');
    });

    it('should return correct display name for basketball channel', () => {
      expect(router.getChannelName(mockChannelConfig.basketball)).toBe('#농구MAX2MAX');
    });

    it('should return correct display name for design channel', () => {
      expect(router.getChannelName(mockChannelConfig.design)).toBe('#디자인');
    });

    it('should return correct display name for claim channel', () => {
      expect(router.getChannelName(mockChannelConfig.claim)).toBe('#클레임');
    });

    it('should return Unknown Channel for invalid channel ID', () => {
      expect(router.getChannelName('INVALID_CHANNEL')).toBe('Unknown Channel');
    });
  });

  describe('analyzeIntent', () => {
    it('should identify design-related intent', () => {
      const context = router.analyzeIntent('design.request');
      expect(context.isDesignRelated).toBe(true);
      expect(context.intentCategory).toBe(IntentCategory.DESIGN_INQUIRY);
    });

    it('should identify claim-related intent', () => {
      const context = router.analyzeIntent('claim.general');
      expect(context.isClaim).toBe(true);
      expect(context.intentCategory).toBe(IntentCategory.CLAIM);
    });

    it('should identify sample-related intent', () => {
      const context = router.analyzeIntent('sample.request');
      expect(context.isSampleRequest).toBe(true);
      expect(context.intentCategory).toBe(IntentCategory.SAMPLE_REQUEST);
    });

    it('should identify payment-related intent', () => {
      const context = router.analyzeIntent('payment.inquiry');
      expect(context.isPaymentRelated).toBe(true);
      expect(context.intentCategory).toBe(IntentCategory.PAYMENT_DELIVERY);
    });

    it('should extract sport type from parameters', () => {
      const context = router.analyzeIntent('order.new', { sport: '야구' });
      expect(context.sportType).toBe(SportType.BASEBALL);
    });

    it('should extract soccer sport type from parameters', () => {
      const context = router.analyzeIntent('order.new', { sport: 'soccer' });
      expect(context.sportType).toBe(SportType.SOCCER);
    });

    it('should handle Korean sport names', () => {
      const contextBaseball = router.analyzeIntent('order.new', { sport: '야구' });
      expect(contextBaseball.sportType).toBe(SportType.BASEBALL);

      const contextSoccer = router.analyzeIntent('order.new', { sport: '축구' });
      expect(contextSoccer.sportType).toBe(SportType.SOCCER);

      const contextBasketball = router.analyzeIntent('order.new', { sport: '농구' });
      expect(contextBasketball.sportType).toBe(SportType.BASKETBALL);
    });

    it('should return empty context for unrecognized intent', () => {
      const context = router.analyzeIntent('unknown.intent');
      expect(context).toEqual({});
    });
  });

  describe('validateConfiguration', () => {
    it('should validate configuration with all channels', () => {
      expect(router.validateConfiguration()).toBe(true);
    });

    it('should fail validation without default channel', () => {
      const invalidConfig = {
        baseball: 'C1111111111'
      };
      const invalidRouter = new SlackChannelRouter(invalidConfig);
      expect(invalidRouter.validateConfiguration()).toBe(false);
    });

    it('should pass validation with only default channel', () => {
      const minimalConfig = {
        default: 'C9999999999'
      };
      const minimalRouter = new SlackChannelRouter(minimalConfig);
      expect(minimalRouter.validateConfiguration()).toBe(true);
    });
  });
});