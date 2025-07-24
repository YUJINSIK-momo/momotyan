import dialogflow from '@google-cloud/dialogflow';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import logger from '../utils/logger';

// Dialogflow 클라이언트 초기화 (Asia Northeast 1 region)
const sessionClient = new dialogflow.SessionsClient({
  keyFilename: config.dialogflow.credentialsPath,
  apiEndpoint: 'asia-northeast1-dialogflow.googleapis.com'
});

// Intent 인식 결과 타입 정의
export interface IntentDetectionResult {
  intentName: string;
  confidence: number;
  parameters: Record<string, unknown>;
  fulfillmentText?: string;
  queryText: string;
  allRequiredParamsPresent: boolean;
}

// Dialogflow에서 인텐트 감지
export async function detectIntent(
  text: string,
  sessionId?: string
): Promise<IntentDetectionResult | null> {
  try {
    // 세션 ID가 없으면 새로 생성
    const actualSessionId = sessionId || uuidv4();

    // 세션 경로 생성 (Asia Northeast 1 region)
    const sessionPath = sessionClient.projectLocationAgentSessionPath(
      config.dialogflow.projectId,
      'asia-northeast1',
      actualSessionId
    );

    // 요청 객체 생성
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: text,
          languageCode: config.dialogflow.languageCode
        }
      }
    };

    // Dialogflow에 쿼리 전송
    const [response] = await sessionClient.detectIntent(request);
    const result = response.queryResult;

    if (!result || !result.intent) {
      logger.warn('No intent detected from Dialogflow', { text });
      return null;
    }

    const intentResult: IntentDetectionResult = {
      intentName: result.intent.displayName || 'unknown',
      confidence: result.intentDetectionConfidence || 0,
      parameters: result.parameters?.fields
        ? extractParameters(result.parameters.fields as Record<string, DialogflowValue>)
        : {},
      fulfillmentText: result.fulfillmentText || undefined,
      queryText: result.queryText || text,
      allRequiredParamsPresent: result.allRequiredParamsPresent || false
    };

    logger.info('Intent detected successfully', {
      sessionId: actualSessionId,
      intent: intentResult.intentName,
      confidence: intentResult.confidence
    });

    return intentResult;
  } catch (error) {
    logger.error('Error detecting intent from Dialogflow', { error, text });
    return null;
  }
}

// Dialogflow Value 타입 정의
interface DialogflowValue {
  stringValue?: string | null;
  numberValue?: number | null;
  boolValue?: boolean | null;
  structValue?: { fields: Record<string, DialogflowValue> } | null;
  listValue?: { values: DialogflowValue[] } | null;
}

// Dialogflow 파라미터 추출 헬퍼 함수
function extractParameters(fields: Record<string, DialogflowValue>): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value.stringValue !== null && value.stringValue !== undefined) {
      params[key] = value.stringValue;
    } else if (value.numberValue !== null && value.numberValue !== undefined) {
      params[key] = value.numberValue;
    } else if (value.boolValue !== null && value.boolValue !== undefined) {
      params[key] = value.boolValue;
    } else if (value.structValue && value.structValue.fields) {
      params[key] = extractParameters(value.structValue.fields);
    } else if (value.listValue && value.listValue.values) {
      params[key] = value.listValue.values.map((v: DialogflowValue) => {
        if (v.stringValue !== null && v.stringValue !== undefined) {
          return v.stringValue;
        }
        if (v.numberValue !== null && v.numberValue !== undefined) {
          return v.numberValue;
        }
        if (v.boolValue !== null && v.boolValue !== undefined) {
          return v.boolValue;
        }
        return v;
      });
    }
  }

  return params;
}

// 여러 인텐트를 일괄 처리하는 함수 (옵션)
export async function detectIntentBatch(
  texts: string[],
  sessionId?: string
): Promise<(IntentDetectionResult | null)[]> {
  const actualSessionId = sessionId || uuidv4();

  const results = await Promise.all(
    texts.map(text => detectIntent(text, actualSessionId))
  );

  return results;
}

// 인텐트 신뢰도가 임계값 이상인지 확인
export function isConfidentIntent(
  result: IntentDetectionResult | null,
  threshold: number = config.dialogflow.confidenceThreshold
): boolean {
  return result !== null && result.confidence >= threshold;
}

// 특정 인텐트인지 확인
export function isIntent(
  result: IntentDetectionResult | null,
  intentName: string
): boolean {
  return result !== null &&
         result.intentName.toLowerCase() === intentName.toLowerCase();
}

// 폴백 인텐트인지 확인
export function isFallbackIntent(result: IntentDetectionResult | null): boolean {
  if (!result) {
    return true;
  }

  const fallbackIntents = [
    'default fallback intent',
    'fallback',
    'unknown'
  ];

  return fallbackIntents.some(name =>
    result.intentName.toLowerCase().includes(name)
  );
}