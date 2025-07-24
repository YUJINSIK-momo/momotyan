import { WebClient } from '@slack/web-api';
import { IncomingWebhook } from '@slack/webhook';
import { config } from '../config';
import logger from '../utils/logger';
import { initializeChannelRouter, ChannelRoutingContext } from './slack-channel-router';
import { SportType, IntentCategory } from '../generated/prisma';

// Slack 클라이언트 초기화
const slackClient = new WebClient(config.slack.botToken);
const webhook = new IncomingWebhook(config.slack.webhookUrl);

// 채널 라우터 초기화
const channelRouter = initializeChannelRouter(config.slack.channels);

// 타입 정의
interface ApprovalData {
  messageId: string;
  userId: string;
  reply?: string;
}

interface ApprovalRequestOptions {
  sportType?: SportType;
  brand?: string;
  intentCategory?: IntentCategory;
  intentName?: string;
  channelOverride?: string; // 특정 채널 강제 지정
}

// 승인 요청 메시지 전송 함수
export async function sendApprovalRequest(
  customerMessage: string,
  suggestedReply: string,
  userId: string,
  messageId: string,
  options: ApprovalRequestOptions = {}
) {
  try {
    const blocks = [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: '*새로운 고객 문의가 도착했습니다*'
        }
      },
      {
        type: 'divider' as const
      },
      {
        type: 'section' as const,
        fields: [
          {
            type: 'mrkdwn' as const,
            text: `*고객 ID:*\n${userId}`
          },
          {
            type: 'mrkdwn' as const,
            text: `*시간:*\n${new Date().toLocaleString('ko-KR')}`
          }
        ]
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*고객 메시지:*\n\`\`\`${customerMessage}\`\`\``
        }
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*AI 제안 답변:*\n\`\`\`${suggestedReply}\`\`\``
        }
      },
      {
        type: 'actions' as const,
        block_id: 'approval_actions',
        elements: [
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '✅ 승인',
              emoji: true
            },
            style: 'primary' as const,
            action_id: 'approve_reply',
            value: JSON.stringify({ messageId, userId, reply: suggestedReply } as ApprovalData)
          },
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '✏️ 수정',
              emoji: true
            },
            action_id: 'edit_reply',
            value: JSON.stringify({ messageId, userId } as ApprovalData)
          },
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '❌ 거절',
              emoji: true
            },
            style: 'danger' as const,
            action_id: 'reject_reply',
            value: JSON.stringify({ messageId, userId } as ApprovalData)
          }
        ]
      }
    ];

    // 적절한 채널 결정
    let targetChannel: string;
    if (options.channelOverride) {
      targetChannel = options.channelOverride;
    } else {
      // 채널 라우터를 사용하여 적절한 채널 결정
      const routingContext: ChannelRoutingContext = {
        sportType: options.sportType,
        brand: options.brand,
        intentCategory: options.intentCategory
      };

      // 인텐트 이름을 기반으로 추가 컨텍스트 분석
      if (options.intentName) {
        const analyzedContext = channelRouter.analyzeIntent(options.intentName);
        Object.assign(routingContext, analyzedContext);
      }

      targetChannel = channelRouter.getChannel(routingContext);
    }

    const channelName = channelRouter.getChannelName(targetChannel);

    // 메시지에 채널 정보 추가
    const contextBlock = {
      type: 'context' as const,
      elements: [
        {
          type: 'mrkdwn' as const,
          text: `📍 채널: ${channelName}`
        }
      ]
    };
    // 컨텍스트 블록을 포함하기 위해 타입 어설션 사용
    // Slack API는 다양한 블록 타입을 허용하므로 any[] 사용이 일반적임
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allBlocks = [contextBlock, ...blocks] as any[];

    // 채널에 메시지 전송
    const result = await slackClient.chat.postMessage({
      channel: targetChannel,
      blocks: allBlocks,
      text: '새로운 고객 문의가 도착했습니다' // 폴백 텍스트
    });

    logger.info('Slack approval request sent', {
      userId,
      messageId,
      timestamp: result.ts,
      channel: targetChannel,
      channelName: channelName
    });

    return result;
  } catch (error) {
    logger.error('Slack 메시지 전송 오류:', { error });
    throw error;
  }
}

// 간단한 알림 메시지 전송 함수
export async function sendNotification(message: string, channel?: string) {
  try {
    // 채널이 지정된 경우 해당 채널로, 아니면 기본 웹훅으로
    if (channel) {
      await slackClient.chat.postMessage({
        channel: channel,
        text: message,
        icon_emoji: ':robot_face:'
      });
    } else {
      await webhook.send({
        text: message,
        icon_emoji: ':robot_face:'
      });
    }

    logger.info('Slack notification sent', { message });
  } catch (error) {
    logger.error('Slack 알림 전송 오류:', { error });
  }
}

// 스레드에 답글 달기 함수
export async function replyInThread(channel: string, timestamp: string, message: string) {
  try {
    const result = await slackClient.chat.postMessage({
      channel: channel,
      thread_ts: timestamp,
      text: message
    });

    logger.info('Slack thread reply sent', {
      channel,
      threadTimestamp: timestamp,
      replyTimestamp: result.ts
    });

    return result;
  } catch (error) {
    logger.error('스레드 답글 오류:', { error });
    throw error;
  }
}

// Slack 클라이언트 및 라우터 export
export { slackClient, channelRouter };

// 초기화 시 설정 확인
logger.info('Slack integration initialized', {
  hasWebhookUrl: !!config.slack.webhookUrl,
  hasBotToken: !!config.slack.botToken,
  hasChannelId: !!config.slack.channelId,
  channelsConfigured: Object.keys(config.slack.channels).filter(key => {
    const channels = config.slack.channels as Record<string, string>;
    return channels[key];
  }).length
});