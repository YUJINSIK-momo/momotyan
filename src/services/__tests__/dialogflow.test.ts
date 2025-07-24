import dialogflow from '@google-cloud/dialogflow';
import { v4 as uuidv4 } from 'uuid';
import {
  detectIntent,
  detectIntentBatch,
  isConfidentIntent,
  isIntent,
  isFallbackIntent,
  IntentDetectionResult
} from '../dialogflow';
import logger from '../../utils/logger';

// 의존성 모킹
jest.mock('@google-cloud/dialogflow');
jest.mock('uuid');
jest.mock('../../utils/logger');
jest.mock('../../config', () => ({
  config: {
    dialogflow: {
      projectId: 'test-project',
      languageCode: 'ko-KR',
      credentialsPath: './test-credentials.json',
      confidenceThreshold: 0.7
    }
  }
}));

describe('Dialogflow Service', () => {
  let mockSessionsClient: jest.Mock;
  let mockDetectIntent: jest.Mock;
  let mockProjectLocationAgentSessionPath: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // 모킹 설정
    mockDetectIntent = jest.fn();
    mockProjectLocationAgentSessionPath = jest.fn();

    mockSessionsClient = jest.fn().mockImplementation(() => ({
      detectIntent: mockDetectIntent,
      projectLocationAgentSessionPath: mockProjectLocationAgentSessionPath
    }));

    (dialogflow.SessionsClient as unknown as jest.Mock) = mockSessionsClient;
    (uuidv4 as jest.Mock).mockReturnValue('test-session-id');
  });

  describe('detectIntent', () => {
    it('should detect intent successfully', async () => {
      const text = '유니폼 가격을 알려주세요';
      const sessionId = 'custom-session-id';

      mockProjectLocationAgentSessionPath.mockReturnValue('projects/test-project/locations/asia-northeast1/agent/sessions/custom-session-id');

      const mockResponse = {
        queryResult: {
          intent: { displayName: 'price.inquiry' },
          intentDetectionConfidence: 0.85,
          parameters: {
            fields: {
              sport: { stringValue: '야구' },
              quantity: { numberValue: 10 }
            }
          },
          fulfillmentText: '유니폼 가격에 대해서는...',
          queryText: text,
          allRequiredParamsPresent: true
        }
      };

      mockDetectIntent.mockResolvedValue([mockResponse]);

      const result = await detectIntent(text, sessionId);

      expect(mockProjectLocationAgentSessionPath).toHaveBeenCalledWith(
        'test-project',
        'asia-northeast1',
        'custom-session-id'
      );

      expect(mockDetectIntent).toHaveBeenCalledWith({
        session: 'projects/test-project/locations/asia-northeast1/agent/sessions/custom-session-id',
        queryInput: {
          text: {
            text,
            languageCode: 'ko-KR'
          }
        }
      });

      expect(result).toEqual({
        intentName: 'price.inquiry',
        confidence: 0.85,
        parameters: {
          sport: '야구',
          quantity: 10
        },
        fulfillmentText: 'ユニフォームの価格については...',
        queryText: text,
        allRequiredParamsPresent: true
      });

      expect(logger.info).toHaveBeenCalledWith('Intent detected successfully', {
        sessionId: 'custom-session-id',
        intent: 'price.inquiry',
        confidence: 0.85
      });
    });

    it('should generate session ID if not provided', async () => {
      const text = '테스트 메시지';

      mockProjectLocationAgentSessionPath.mockReturnValue('projects/test-project/locations/asia-northeast1/agent/sessions/test-session-id');

      const mockResponse = {
        queryResult: {
          intent: { displayName: 'test.intent' },
          intentDetectionConfidence: 0.9
        }
      };

      mockDetectIntent.mockResolvedValue([mockResponse]);

      await detectIntent(text);

      expect(uuidv4).toHaveBeenCalled();
      expect(mockProjectLocationAgentSessionPath).toHaveBeenCalledWith(
        'test-project',
        'asia-northeast1',
        'test-session-id'
      );
    });

    it('should handle no intent detected', async () => {
      const text = '모르는 질문';

      mockProjectLocationAgentSessionPath.mockReturnValue('projects/test-project/locations/asia-northeast1/agent/sessions/test-session-id');

      const mockResponse = {
        queryResult: {}
      };

      mockDetectIntent.mockResolvedValue([mockResponse]);

      const result = await detectIntent(text);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('No intent detected from Dialogflow', { text });
    });

    it('should handle complex parameter structures', async () => {
      const text = '팀 정보 업데이트';

      mockProjectLocationAgentSessionPath.mockReturnValue('projects/test-project/locations/asia-northeast1/agent/sessions/test-session-id');

      const mockResponse = {
        queryResult: {
          intent: { displayName: 'team.update' },
          intentDetectionConfidence: 0.95,
          parameters: {
            fields: {
              teamInfo: {
                structValue: {
                  fields: {
                    name: { stringValue: '도쿄 라이온즈' },
                    members: { numberValue: 25 }
                  }
                }
              },
              colors: {
                listValue: {
                  values: [
                    { stringValue: '파란색' },
                    { stringValue: '흰색' },
                    { stringValue: '빨간색' }
                  ]
                }
              }
            }
          }
        }
      };

      mockDetectIntent.mockResolvedValue([mockResponse]);

      const result = await detectIntent(text);

      expect(result?.parameters).toEqual({
        teamInfo: {
          name: '도쿄 라이온즈',
          members: 25
        },
        colors: ['파란색', '흰색', '빨간색']
      });
    });

    it('should handle errors gracefully', async () => {
      const text = '에러 테스트';
      const error = new Error('Dialogflow API error');

      mockProjectLocationAgentSessionPath.mockReturnValue('projects/test-project/locations/asia-northeast1/agent/sessions/test-session-id');
      mockDetectIntent.mockRejectedValue(error);

      const result = await detectIntent(text);

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error detecting intent from Dialogflow', { error, text });
    });
  });

  describe('detectIntentBatch', () => {
    it('should process multiple texts in batch', async () => {
      const texts = ['가격을 알려주세요', '디자인을 보여주세요', '납기는?'];

      mockProjectLocationAgentSessionPath.mockReturnValue('projects/test-project/locations/asia-northeast1/agent/sessions/test-session-id');

      const mockResponses = [
        {
          queryResult: {
            intent: { displayName: 'price.inquiry' },
            intentDetectionConfidence: 0.9
          }
        },
        {
          queryResult: {
            intent: { displayName: 'design.request' },
            intentDetectionConfidence: 0.85
          }
        },
        {
          queryResult: {
            intent: { displayName: 'delivery.inquiry' },
            intentDetectionConfidence: 0.8
          }
        }
      ];

      mockDetectIntent
        .mockResolvedValueOnce([mockResponses[0]])
        .mockResolvedValueOnce([mockResponses[1]])
        .mockResolvedValueOnce([mockResponses[2]]);

      const results = await detectIntentBatch(texts);

      expect(results).toHaveLength(3);
      expect(results[0]?.intentName).toBe('price.inquiry');
      expect(results[1]?.intentName).toBe('design.request');
      expect(results[2]?.intentName).toBe('delivery.inquiry');

      // 모든 텍스트에 대해 동일한 세션 ID를 사용해야 함
      expect(mockProjectLocationAgentSessionPath).toHaveBeenCalledTimes(3);
      expect(mockProjectLocationAgentSessionPath.mock.calls[0][2]).toBe('test-session-id');
      expect(mockProjectLocationAgentSessionPath.mock.calls[1][2]).toBe('test-session-id');
      expect(mockProjectLocationAgentSessionPath.mock.calls[2][2]).toBe('test-session-id');
    });
  });

  describe('isConfidentIntent', () => {
    it('should return true for confident intent', () => {
      const result: IntentDetectionResult = {
        intentName: 'test.intent',
        confidence: 0.85,
        parameters: {},
        queryText: 'test',
        allRequiredParamsPresent: true
      };

      expect(isConfidentIntent(result)).toBe(true);
    });

    it('should return false for low confidence intent', () => {
      const result: IntentDetectionResult = {
        intentName: 'test.intent',
        confidence: 0.5,
        parameters: {},
        queryText: 'test',
        allRequiredParamsPresent: true
      };

      expect(isConfidentIntent(result)).toBe(false);
    });

    it('should use custom threshold', () => {
      const result: IntentDetectionResult = {
        intentName: 'test.intent',
        confidence: 0.6,
        parameters: {},
        queryText: 'test',
        allRequiredParamsPresent: true
      };

      expect(isConfidentIntent(result, 0.5)).toBe(true);
      expect(isConfidentIntent(result, 0.8)).toBe(false);
    });

    it('should return false for null result', () => {
      expect(isConfidentIntent(null)).toBe(false);
    });
  });

  describe('isIntent', () => {
    it('should match intent name case-insensitively', () => {
      const result: IntentDetectionResult = {
        intentName: 'Price.Inquiry',
        confidence: 0.9,
        parameters: {},
        queryText: 'test',
        allRequiredParamsPresent: true
      };

      expect(isIntent(result, 'price.inquiry')).toBe(true);
      expect(isIntent(result, 'PRICE.INQUIRY')).toBe(true);
      expect(isIntent(result, 'design.request')).toBe(false);
    });

    it('should return false for null result', () => {
      expect(isIntent(null, 'test.intent')).toBe(false);
    });
  });

  describe('isFallbackIntent', () => {
    it('should identify fallback intents', () => {
      const fallbackResults = [
        { intentName: 'Default Fallback Intent', confidence: 0.3, parameters: {}, queryText: 'test', allRequiredParamsPresent: false },
        { intentName: 'fallback', confidence: 0.2, parameters: {}, queryText: 'test', allRequiredParamsPresent: false },
        { intentName: 'unknown', confidence: 0.1, parameters: {}, queryText: 'test', allRequiredParamsPresent: false },
        { intentName: 'custom.fallback.intent', confidence: 0.4, parameters: {}, queryText: 'test', allRequiredParamsPresent: false }
      ];

      fallbackResults.forEach(result => {
        expect(isFallbackIntent(result)).toBe(true);
      });
    });

    it('should not identify regular intents as fallback', () => {
      const result: IntentDetectionResult = {
        intentName: 'price.inquiry',
        confidence: 0.9,
        parameters: {},
        queryText: 'test',
        allRequiredParamsPresent: true
      };

      expect(isFallbackIntent(result)).toBe(false);
    });

    it('should return true for null result', () => {
      expect(isFallbackIntent(null)).toBe(true);
    });
  });
});