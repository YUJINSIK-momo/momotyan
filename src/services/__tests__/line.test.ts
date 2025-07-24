import * as line from '@line/bot-sdk';
import { sendLineMessage, sendLineRichMessage, lineClient } from '../line';
import logger from '../../utils/logger';

// 의존성 모킹
jest.mock('@line/bot-sdk');
jest.mock('../../utils/logger');
jest.mock('../../config', () => ({
  config: {
    line: {
      channelAccessToken: 'test-channel-access-token'
    }
  }
}));

describe('LINE Service', () => {
  let mockPushMessage: jest.Mock;
  let mockMessagingApiClient: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // 모킹 설정
    mockPushMessage = jest.fn();
    mockMessagingApiClient = jest.fn().mockImplementation(() => ({
      pushMessage: mockPushMessage
    }));

    (line.messagingApi.MessagingApiClient as jest.Mock) = mockMessagingApiClient;
  });

  describe('sendLineMessage', () => {
    it('should send a text message successfully', async () => {
      const userId = 'U123456';
      const message = 'Hello, this is a test message';
      const mockResponse = { id: 'msg123' };

      mockPushMessage.mockResolvedValue(mockResponse);

      const result = await sendLineMessage(userId, message);

      expect(mockPushMessage).toHaveBeenCalledWith({
        to: userId,
        messages: [{
          type: 'text',
          text: message
        }]
      });

      expect(logger.info).toHaveBeenCalledWith('LINE message sent', {
        userId,
        messageLength: message.length,
        response: mockResponse
      });

      expect(result).toEqual(mockResponse);
    });

    it('should handle errors when sending message fails', async () => {
      const userId = 'U123456';
      const message = 'Test message';
      const mockError = new Error('Network error');

      mockPushMessage.mockRejectedValue(mockError);

      await expect(sendLineMessage(userId, message)).rejects.toThrow('Network error');

      expect(logger.error).toHaveBeenCalledWith('LINE message sending error', {
        error: mockError,
        userId,
        message
      });
    });

    it('should handle empty message', async () => {
      const userId = 'U123456';
      const message = '';
      const mockResponse = { id: 'msg123' };

      mockPushMessage.mockResolvedValue(mockResponse);

      const result = await sendLineMessage(userId, message);

      expect(mockPushMessage).toHaveBeenCalledWith({
        to: userId,
        messages: [{
          type: 'text',
          text: ''
        }]
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('sendLineRichMessage', () => {
    it('should send rich messages successfully', async () => {
      const userId = 'U123456';
      const messages = [
        { type: 'text', text: 'First message' },
        { type: 'text', text: 'Second message' },
        {
          type: 'template',
          altText: 'Buttons template',
          template: {
            type: 'buttons',
            text: 'Please select',
            actions: [
              { type: 'message', label: 'Yes', text: 'yes' },
              { type: 'message', label: 'No', text: 'no' }
            ]
          }
        }
      ];
      const mockResponse = { id: 'msg456' };

      mockPushMessage.mockResolvedValue(mockResponse);

      const result = await sendLineRichMessage(userId, messages);

      expect(mockPushMessage).toHaveBeenCalledWith({
        to: userId,
        messages
      });

      expect(logger.info).toHaveBeenCalledWith('LINE rich message sent', {
        userId,
        messageCount: messages.length,
        response: mockResponse
      });

      expect(result).toEqual(mockResponse);
    });

    it('should handle errors when sending rich message fails', async () => {
      const userId = 'U123456';
      const messages = [{ type: 'text', text: 'Test' }];
      const mockError = new Error('Invalid message format');

      mockPushMessage.mockRejectedValue(mockError);

      await expect(sendLineRichMessage(userId, messages)).rejects.toThrow('Invalid message format');

      expect(logger.error).toHaveBeenCalledWith('LINE rich message sending error', {
        error: mockError,
        userId
      });
    });

    it('should handle empty messages array', async () => {
      const userId = 'U123456';
      const messages: Array<{ type: string; text: string }> = [];
      const mockResponse = { id: 'msg789' };

      mockPushMessage.mockResolvedValue(mockResponse);

      const result = await sendLineRichMessage(userId, messages);

      expect(mockPushMessage).toHaveBeenCalledWith({
        to: userId,
        messages: []
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('lineClient export', () => {
    it('should export the LINE client instance', () => {
      expect(lineClient).toBeDefined();
      expect(mockMessagingApiClient).toHaveBeenCalledWith({
        channelAccessToken: 'test-channel-access-token'
      });
    });
  });
});