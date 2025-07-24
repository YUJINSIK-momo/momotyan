import * as line from '@line/bot-sdk';
import { config } from '../config';
import logger from '../utils/logger';

// LINE 클라이언트 생성
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken
});

// LINE 메시지 전송 함수
export async function sendLineMessage(userId: string, message: string) {
  try {
    const response = await client.pushMessage({
      to: userId,
      messages: [{
        type: 'text',
        text: message
      }]
    });

    logger.info('LINE message sent', {
      userId,
      messageLength: message.length,
      response
    });

    return response;
  } catch (error) {
    logger.error('LINE message sending error', {
      error,
      userId,
      message
    });
    throw error;
  }
}

// 리치 메시지 전송 함수 (옵션)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendLineRichMessage(userId: string, messages: any[]) {
  try {
    const response = await client.pushMessage({
      to: userId,
      messages: messages
    });

    logger.info('LINE rich message sent', {
      userId,
      messageCount: messages.length,
      response
    });

    return response;
  } catch (error) {
    logger.error('LINE rich message sending error', {
      error,
      userId
    });
    throw error;
  }
}

// LINE 사용자 프로필 가져오기
export async function getLineUserProfile(userId: string) {
  try {
    const profile = await client.getProfile(userId);

    logger.info('LINE user profile fetched', {
      userId,
      displayName: profile.displayName
    });

    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage
    };
  } catch (error) {
    logger.error('Failed to get LINE user profile', {
      error,
      userId
    });
    throw error;
  }
}

// Export client for other uses
export { client as lineClient };