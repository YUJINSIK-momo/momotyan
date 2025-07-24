import request from 'supertest';
import express from 'express';
import * as line from '@line/bot-sdk';
import lineRouter from '../line';

// 의존성 모킹
jest.mock('@line/bot-sdk');
jest.mock('../../services/slack');
jest.mock('../../services/line');
jest.mock('../../services/chatbot');
jest.mock('../../services/database');
jest.mock('../../utils/logger');

const mockLine = line as jest.Mocked<typeof line>;

describe('LINE Multi-Channel Support', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(lineRouter);

    // LINE 미들웨어 모킹
    (mockLine.middleware as jest.Mock).mockReturnValue((req: express.Request, res: express.Response, next: express.NextFunction) => {
      next();
    });

    // MessagingApiClient 모킹
    const mockReplyMessage = jest.fn().mockResolvedValue({});
    (mockLine.messagingApi.MessagingApiClient as jest.Mock).mockImplementation(() => ({
      replyMessage: mockReplyMessage
    }));
  });

  describe('Webhook endpoints', () => {
    it('should handle default channel webhook', async () => {
      const event = {
        type: 'message',
        source: { userId: 'U123', type: 'user' },
        message: { type: 'text', text: 'test message', id: 'msg123' },
        replyToken: 'reply-token'
      };

      const response = await request(app)
        .post('/webhook')
        .send({ events: [event] });

      expect(response.status).toBe(200);
    });

    it('should handle ILB-MAX channel webhook', async () => {
      const event = {
        type: 'message',
        source: { userId: 'U123', type: 'user' },
        message: { type: 'text', text: '야구 유니폼 문의', id: 'msg123' },
        replyToken: 'reply-token'
      };

      const response = await request(app)
        .post('/webhook/ilb-max')
        .send({ events: [event] });

      expect(response.status).toBe(200);
    });

    it('should handle MAX2MAX channel webhook', async () => {
      const event = {
        type: 'message',
        source: { userId: 'U123', type: 'user' },
        message: { type: 'text', text: '축구 유니폼 문의', id: 'msg123' },
        replyToken: 'reply-token'
      };

      const response = await request(app)
        .post('/webhook/max2max')
        .send({ events: [event] });

      expect(response.status).toBe(200);
    });
  });

  describe('Channel routing context', () => {
    it('should include LINE channel context in Slack routing', async () => {
      const { sendApprovalRequest } = require('../../services/slack');
      const { processMessage } = require('../../services/chatbot');

      processMessage.mockResolvedValue({
        success: true,
        message: '테스트 응답',
        intentCategory: 'GENERAL_INQUIRY'
      });

      const event = {
        type: 'message',
        source: { userId: 'U123', type: 'user' },
        message: { type: 'text', text: '야구 유니폼 가격', id: 'msg123' },
        replyToken: 'reply-token'
      };

      await request(app)
        .post('/webhook/ilb-max')
        .send({ events: [event] });

      expect(sendApprovalRequest).toHaveBeenCalledWith(
        '야구 유니폼 가격',
        '테스트 응답',
        'U123',
        'msg123',
        expect.objectContaining({
          lineChannelName: 'ilbMax'
        })
      );
    });
  });

  describe('Test webhook endpoints', () => {
    it('should handle default test webhook', async () => {
      const { detectIntent } = require('../../services/dialogflow');

      detectIntent.mockResolvedValue({
        intentName: 'test.intent',
        confidence: 0.8,
        parameters: {},
        queryText: 'test'
      });

      const event = {
        type: 'message',
        source: { userId: 'U123', type: 'user' },
        message: { type: 'text', text: 'test', id: 'msg123' },
        replyToken: 'reply-token'
      };

      const response = await request(app)
        .post('/webhook-test')
        .send({ events: [event] });

      expect(response.status).toBe(200);
    });

    it('should handle brand-specific test webhooks', async () => {
      const { detectIntent } = require('../../services/dialogflow');

      detectIntent.mockResolvedValue({
        intentName: 'price.inquiry',
        confidence: 0.9,
        parameters: { sport: '야구' },
        queryText: '야구 유니폼 가격'
      });

      const event = {
        type: 'message',
        source: { userId: 'U123', type: 'user' },
        message: { type: 'text', text: '야구 유니폼 가격', id: 'msg123' },
        replyToken: 'reply-token'
      };

      const response = await request(app)
        .post('/webhook-test/ilb-max')
        .send({ events: [event] });

      expect(response.status).toBe(200);
    });
  });
});