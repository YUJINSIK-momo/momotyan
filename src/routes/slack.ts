import express, { Request, Response, Router } from 'express';
import { slackClient, replyInThread } from '../services/slack';
import { sendLineMessage } from '../services/line';
import logger from '../utils/logger';

const router: Router = express.Router();

// Slack payload 타입 정의
interface SlackInteractivePayload {
  type: string;
  user: {
    id: string;
    name: string;
  };
  channel?: {
    id: string;
    name: string;
  };
  message?: {
    ts: string;
    blocks: Array<{
      type: string;
      text?: {
        type: string;
        text: string;
      };
      elements?: Array<{
        type: string;
        action_id?: string;
        text?: {
          type: string;
          text: string;
        };
        value?: string;
      }>;
      block_id?: string;
    }>;
  };
  actions?: Array<{
    action_id: string;
    value: string;
  }>;
  trigger_id?: string;
  view?: {
    callback_id: string;
    private_metadata: string;
    state: {
      values: {
        [key: string]: {
          [key: string]: {
            value: string;
          };
        };
      };
    };
  };
}

interface ActionData {
  messageId: string;
  userId: string;
  reply?: string;
}

// Slack 인터랙티브 컴포넌트 처리
router.post('/interactive', express.urlencoded({ extended: true }), async (req: Request, res: Response): Promise<void> => {
  try {
    const payload: SlackInteractivePayload = JSON.parse(req.body.payload);

    // 뷰 제출 처리 (모달 제출)
    if (payload.type === 'view_submission') {
      await handleViewSubmission(payload);
      res.status(200).send();
      return;
    }

    // 인터랙티브 컴포넌트 처리 (버튼 클릭)
    const { user, actions, channel } = payload;

    logger.info('Slack interactive event received', {
      type: payload.type,
      user: user?.name,
      channel: channel?.id,
      actionCount: actions?.length || 0
    });

    if (!actions || actions.length === 0) {
      res.status(200).send('No actions');
      return;
    }

    const action = actions[0];
    const actionData: ActionData = JSON.parse(action.value);

    switch (action.action_id) {
    case 'approve_reply':
      await handleApproval(payload, actionData);
      break;

    case 'edit_reply':
      await handleEdit(payload, actionData);
      break;

    case 'reject_reply':
      await handleReject(payload, actionData);
      break;
    }

    res.status(200).send();
  } catch (error) {
    logger.error('Slack interactive 처리 오류:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    });
    res.status(500).send('Error processing interactive component');
  }
});

// 승인 처리
async function handleApproval(payload: SlackInteractivePayload, actionData: ActionData) {
  const { messageId, userId, reply } = actionData;
  const { user, channel, message } = payload;

  if (!channel || !message) {
    logger.error('Missing channel or message in approval payload');
    return;
  }

  try {
    // LINE으로 메시지 전송
    if (reply) {
      await sendLineMessage(userId, reply);
    }

    // Slack 메시지 업데이트
    const updatedBlocks = [...message.blocks];
    updatedBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *승인됨* - ${user.name}님이 ${new Date().toLocaleString('ko-KR')}에 승인`
      }
    });

    // 버튼 제거
    const filteredBlocks = updatedBlocks.filter(block => block.block_id !== 'approval_actions');

    await slackClient.chat.update({
      channel: channel.id,
      ts: message.ts,
      blocks: filteredBlocks
    });

    // 스레드에 기록
    await replyInThread(channel.id, message.ts,
      `✅ 답변이 고객에게 전송되었습니다.\n전송 시간: ${new Date().toLocaleString('ko-KR')}`
    );

    logger.info('Approval handled successfully', { messageId, userId });
  } catch (error) {
    logger.error('승인 처리 오류:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      messageId,
      userId
    });
    await replyInThread(channel.id, message.ts,
      `❌ 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// 수정 처리
async function handleEdit(payload: SlackInteractivePayload, actionData: ActionData) {
  const { messageId, userId } = actionData;
  const { channel, message, trigger_id } = payload;

  if (!trigger_id || !channel || !message) {
    logger.error('Missing required fields for edit modal', {
      hasTrigger: !!trigger_id,
      hasChannel: !!channel,
      hasMessage: !!message
    });
    return;
  }

  try {
    // 모달 오픈 (수정 UI)
    await slackClient.views.open({
      trigger_id: trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'edit_reply_modal',
        private_metadata: JSON.stringify({ messageId, userId, channel: channel.id, ts: message.ts }),
        title: {
          type: 'plain_text' as const,
          text: '답변 수정'
        },
        blocks: [
          {
            type: 'input' as const,
            block_id: 'reply_input',
            label: {
              type: 'plain_text' as const,
              text: '수정할 답변을 입력하세요'
            },
            element: {
              type: 'plain_text_input' as const,
              action_id: 'reply_text',
              multiline: true,
              initial_value: actionData.reply || ''
            }
          }
        ],
        submit: {
          type: 'plain_text' as const,
          text: '전송'
        }
      }
    });

    logger.info('Edit modal opened', { messageId, userId });
  } catch (error) {
    logger.error('수정 모달 오류:', { error });
  }
}

// 거절 처리
async function handleReject(payload: SlackInteractivePayload, actionData: ActionData) {
  const { messageId, userId } = actionData;
  const { user, channel, message } = payload;

  if (!channel || !message) {
    logger.error('Missing channel or message in reject payload');
    return;
  }

  try {
    // Slack 메시지 업데이트
    const updatedBlocks = [...message.blocks];
    updatedBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *거절됨* - ${user.name}님이 ${new Date().toLocaleString('ko-KR')}에 거절`
      }
    });

    // 버튼 제거
    const filteredBlocks = updatedBlocks.filter(block => block.block_id !== 'approval_actions');

    await slackClient.chat.update({
      channel: channel.id,
      ts: message.ts,
      blocks: filteredBlocks
    });

    // 스레드에 기록
    await replyInThread(channel.id, message.ts,
      '❌ 답변이 거절되었습니다. 수동으로 응대해주세요.'
    );

    logger.info('Rejection handled successfully', { messageId, userId });
  } catch (error) {
    logger.error('거절 처리 오류:', { error });
  }
}

// View submission 처리 함수
async function handleViewSubmission(payload: SlackInteractivePayload) {
  const { view } = payload;

  logger.info('Slack view submission received', {
    callbackId: view?.callback_id
  });

  if (view?.callback_id === 'edit_reply_modal') {
    const metadata = JSON.parse(view.private_metadata);
    const editedReply = view.state.values.reply_input.reply_text.value;

    // LINE으로 수정된 메시지 전송
    await sendLineMessage(metadata.userId, editedReply);

    // 원본 메시지 스레드에 기록
    await replyInThread(metadata.channel, metadata.ts,
      `✏️ 수정된 답변이 전송되었습니다:\n\`\`\`${editedReply}\`\`\``
    );

    logger.info('Edited reply sent', {
      userId: metadata.userId,
      replyLength: editedReply.length
    });
  }
}

export default router;