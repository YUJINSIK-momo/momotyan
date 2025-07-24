require('dotenv').config();
const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');
const projectId = process.env.DIALOGFLOW_PROJECT_ID;
const languageCode = process.env.DIALOGFLOW_LANGUAGE_CODE || 'ja-JP';

console.log('DIALOGFLOW_PROJECT_ID:', projectId);
console.log('DIALOGFLOW_LANGUAGE_CODE:', languageCode);

async function main() {
  // asia-northeast1 리전용 endpoint 명시
  const sessionClient = new dialogflow.SessionsClient({
    apiEndpoint: 'asia-northeast1-dialogflow.googleapis.com'
  });
  const sessionId = uuid.v4();
  const sessionPath = sessionClient.projectLocationAgentSessionPath(
    projectId,
    'asia-northeast1',
    sessionId
  );

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: '銀行振り込み先を教えてください',
        languageCode: languageCode
      }
    }
  };

  try {
    const [response] = await sessionClient.detectIntent(request);
    const result = response.queryResult;
    if (!result || !result.intent) {
      console.log('❌ 인텐트 감지 실패 (No intent detected)');
      console.log(result);
    } else {
      console.log('✅ 인텐트 감지 성공!');
      console.log('Intent:', result.intent.displayName);
      console.log('Confidence:', result.intentDetectionConfidence);
      console.log('Fulfillment:', result.fulfillmentText);
      console.log('Query:', result.queryText);
      console.log('Parameters:', result.parameters);
    }
  } catch (error) {
    console.error('❌ Dialogflow detectIntent 호출 에러:', error);
  }
}

main(); 