import { LineChannelRouter } from '../line-channel-router';
import { SportType } from '../../generated/prisma';

// 설정 모킹
jest.mock('../../config', () => ({
  config: {
    line: {
      channelId: 'default-channel-id',
      channelSecret: 'default-secret',
      channelAccessToken: 'default-token',
      channels: {
        ilbMax: {
          channelId: 'ilb-max-channel-id',
          channelSecret: 'ilb-max-secret',
          channelAccessToken: 'ilb-max-token',
          brand: 'ILB_MAX',
          sportType: 'BASEBALL'
        },
        max2max: {
          channelId: 'max2max-channel-id',
          channelSecret: 'max2max-secret',
          channelAccessToken: 'max2max-token',
          brand: 'MAX2MAX',
          sportType: null
        }
      }
    }
  }
}));

// 로거 모킹
jest.mock('../../utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };
  return {
    default: mockLogger,
    __esModule: true
  };
});

describe('LineChannelRouter', () => {
  let router: LineChannelRouter;

  beforeEach(() => {
    router = new LineChannelRouter();
  });

  describe('getChannelById', () => {
    it('should return channel info by channel ID', () => {
      const defaultChannel = router.getChannelById('default-channel-id');
      expect(defaultChannel).toMatchObject({
        channelId: 'default-channel-id',
        channelSecret: 'default-secret',
        channelAccessToken: 'default-token',
        brand: 'DEFAULT',
        name: 'default'
      });

      const ilbMaxChannel = router.getChannelById('ilb-max-channel-id');
      expect(ilbMaxChannel).toMatchObject({
        channelId: 'ilb-max-channel-id',
        channelSecret: 'ilb-max-secret',
        channelAccessToken: 'ilb-max-token',
        brand: 'ILB_MAX',
        sportType: SportType.BASEBALL,
        name: 'ilbMax'
      });
    });

    it('should return null for unknown channel ID', () => {
      const channel = router.getChannelById('unknown-channel');
      expect(channel).toBeNull();
    });
  });

  describe('getChannelBySecret', () => {
    it('should return channel info by channel secret', () => {
      const channel = router.getChannelBySecret('ilb-max-secret');
      expect(channel).toMatchObject({
        channelSecret: 'ilb-max-secret',
        brand: 'ILB_MAX'
      });
    });

    it('should return null for unknown secret', () => {
      const channel = router.getChannelBySecret('unknown-secret');
      expect(channel).toBeNull();
    });
  });

  describe('getChannelFromHeaders', () => {
    it('should return channel info from x-line-channel-id header', () => {
      const headers = {
        'x-line-channel-id': 'max2max-channel-id'
      };

      const channel = router.getChannelFromHeaders(headers);
      expect(channel).toMatchObject({
        channelId: 'max2max-channel-id',
        brand: 'MAX2MAX'
      });
    });

    it('should return default channel when no header is present', () => {
      const headers = {};
      const channel = router.getChannelFromHeaders(headers);
      expect(channel).toMatchObject({
        channelId: 'default-channel-id',
        brand: 'DEFAULT'
      });
    });
  });

  describe('getAllChannels', () => {
    it('should return all registered channels', () => {
      const channels = router.getAllChannels();
      expect(channels).toHaveLength(3);
      expect(channels.map(ch => ch.name)).toEqual(
        expect.arrayContaining(['default', 'ilbMax', 'max2max'])
      );
    });
  });

  describe('getSlackRoutingContext', () => {
    it('should return routing context for ILB-MAX channel', () => {
      const ilbMaxChannel = router.getChannelById('ilb-max-channel-id');
      expect(ilbMaxChannel).not.toBeNull();

      if (!ilbMaxChannel) {
        throw new Error('Channel should exist');
      }

      const context = router.getSlackRoutingContext(ilbMaxChannel);

      expect(context).toEqual({
        brand: 'ILB_MAX',
        sportType: SportType.BASEBALL
      });
    });

    it('should return routing context for MAX2MAX channel', () => {
      const max2maxChannel = router.getChannelById('max2max-channel-id');
      expect(max2maxChannel).not.toBeNull();

      if (!max2maxChannel) {
        throw new Error('Channel should exist');
      }

      const context = router.getSlackRoutingContext(max2maxChannel);

      expect(context).toEqual({
        brand: 'MAX2MAX',
        sportType: undefined
      });
    });
  });
});