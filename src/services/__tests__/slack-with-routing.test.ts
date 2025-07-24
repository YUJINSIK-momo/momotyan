// import 전에 모킹 설정
const mockPostMessage = jest.fn().mockResolvedValue({ ts: '1234567890.123456' });
const mockWebhookSend = jest.fn().mockResolvedValue(undefined);

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockPostMessage
    }
  }))
}));

jest.mock('@slack/webhook', () => ({
  IncomingWebhook: jest.fn().mockImplementation(() => ({
    send: mockWebhookSend
  }))
}));

jest.mock('../../config', () => ({
  config: {
    slack: {
      botToken: 'xoxb-test-token',
      webhookUrl: 'https://hooks.slack.com/test',
      channelId: 'C0000000000',
      channels: {
        baseball: 'C1111111111',
        soccer: 'C2222222222',
        basketball: 'C3333333333',
        design: 'C4444444444',
        claim: 'C5555555555',
        sample: 'C6666666666',
        payment: 'C7777777777',
        default: 'C8888888888'
      }
    }
  }
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// 모킹 설정 후 import
import { sendApprovalRequest, sendNotification } from '../slack';
import { SportType, IntentCategory } from '../../generated/prisma';

describe('Slack Service - Channel Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendApprovalRequest with channel routing', () => {
    const baseParams = {
      customerMessage: '야구 유니폼을 주문하고 싶습니다',
      suggestedReply: '야구 유니폼 주문을 도와드리겠습니다.',
      userId: 'U123456789',
      messageId: 'msg123'
    };

    it('should route to baseball channel for baseball sport type', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        { sportType: SportType.BASEBALL }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C1111111111'); // 야구 채널

      // 블록에서 채널 정보 확인
      interface SlackBlock {
        type: string;
        elements?: Array<{ text?: string }>;
      }

      const hasChannelInfo = call.blocks.some((block: SlackBlock) =>
        block.type === 'context' &&
        block.elements?.some((el) =>
          el.text?.includes('#아구ILB-MAX')
        )
      );
      expect(hasChannelInfo).toBe(true);
    });

    it('should route to soccer channel for soccer sport type', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        { sportType: SportType.SOCCER }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C2222222222'); // 축구 채널
    });

    it('should route to design channel for design intent category', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        { intentCategory: IntentCategory.DESIGN_INQUIRY }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C4444444444'); // 디자인 채널
    });

    it('should route to claim channel for claim intent category', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        { intentCategory: IntentCategory.CLAIM }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C5555555555'); // 클레임 채널
    });

    it('should prioritize special channels over sport channels', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        {
          sportType: SportType.BASEBALL,
          intentCategory: IntentCategory.DESIGN_INQUIRY
        }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C4444444444'); // 디자인 채널, 야구 채널 아님
    });

    it('should use channel override when provided', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        {
          sportType: SportType.BASEBALL,
          channelOverride: 'C9999999999'
        }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C9999999999'); // 오버라이드 채널
    });

    it('should route to default channel when no routing applies', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        {} // 라우팅 옵션 없음
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C8888888888'); // 기본 채널
    });

    it('should analyze intent name for additional routing context', async () => {
      await sendApprovalRequest(
        baseParams.customerMessage,
        baseParams.suggestedReply,
        baseParams.userId,
        baseParams.messageId,
        { intentName: 'design.request' }
      );

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe('C4444444444'); // 인텐트 이름에서 가져온 디자인 채널
    });

    it('should handle errors gracefully', async () => {
      mockPostMessage.mockRejectedValue(new Error('Slack API error'));

      await expect(
        sendApprovalRequest(
          baseParams.customerMessage,
          baseParams.suggestedReply,
          baseParams.userId,
          baseParams.messageId
        )
      ).rejects.toThrow('Slack API error');
    });
  });

  describe('sendNotification with channel parameter', () => {
    it('should send to specific channel when provided', async () => {
      await sendNotification('Test notification', 'C1234567890');

      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'C1234567890',
        text: 'Test notification',
        icon_emoji: ':robot_face:'
      });
      expect(mockWebhookSend).not.toHaveBeenCalled();
    });

    it('should use webhook when no channel provided', async () => {
      await sendNotification('Test notification');

      expect(mockWebhookSend).toHaveBeenCalledWith({
        text: 'Test notification',
        icon_emoji: ':robot_face:'
      });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('should handle notification errors gracefully', async () => {
      mockWebhookSend.mockRejectedValue(new Error('Webhook error'));

      // 에러를 throw하지 않고 로그만 기록
      await expect(sendNotification('Test notification')).resolves.not.toThrow();
    });
  });
});