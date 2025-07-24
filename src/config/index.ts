import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // 서버 설정
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // LINE 설정
  line: {
    // 기본 채널 (하위 호환성)
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    channelId: process.env.LINE_CHANNEL_ID || '',

    // 멀티 채널 설정
    channels: {
      // ILB-MAX (야구 브랜드)
      ilbMax: {
        channelId: process.env.LINE_CHANNEL_ID_ILB_MAX || '',
        channelSecret: process.env.LINE_CHANNEL_SECRET_ILB_MAX || '',
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_ILB_MAX || '',
        brand: 'ILB_MAX',
        sportType: 'BASEBALL'
      },
      // MAX2MAX (축구/농구 브랜드)
      max2max: {
        channelId: process.env.LINE_CHANNEL_ID_MAX2MAX || '',
        channelSecret: process.env.LINE_CHANNEL_SECRET_MAX2MAX || '',
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_MAX2MAX || '',
        brand: 'MAX2MAX',
        sportType: null // 축구/농구는 대화 중 결정
      }
    }
  },

  // Slack 설정
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    botToken: process.env.SLACK_BOT_TOKEN || '',
    channelId: process.env.SLACK_CHANNEL_ID || '', // 기본 채널 (하위 호환성)
    channels: {
      // 스포츠별 채널
      baseball: process.env.SLACK_CHANNEL_BASEBALL || '',
      soccer: process.env.SLACK_CHANNEL_SOCCER || '',
      basketball: process.env.SLACK_CHANNEL_BASKETBALL || '',
      // 특수 목적 채널
      design: process.env.SLACK_CHANNEL_DESIGN || '',
      claim: process.env.SLACK_CHANNEL_CLAIM || '',
      sample: process.env.SLACK_CHANNEL_SAMPLE || '',
      payment: process.env.SLACK_CHANNEL_PAYMENT || '',
      // 기본 채널
      default: process.env.SLACK_CHANNEL_DEFAULT || process.env.SLACK_CHANNEL_ID || ''
    }
  },

  // Dialogflow 설정
  dialogflow: {
    projectId: process.env.DIALOGFLOW_PROJECT_ID || '',
    languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || 'ja-JP',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    confidenceThreshold: parseFloat(process.env.DIALOGFLOW_CONFIDENCE_THRESHOLD || '0.7'),
    quickResponseThreshold: parseFloat(process.env.DIALOGFLOW_QUICK_RESPONSE_THRESHOLD || '0.9')
  },

  // LLM API 설정
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    apiUrl: process.env.LLM_API_URL || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1000', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7')
  },

  // WooCommerce 설정
  woocommerce: {
    url: process.env.WOOCOMMERCE_URL || '',
    consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY || '',
    consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET || '',
    version: process.env.WOOCOMMERCE_VERSION || 'wc/v3'
  },

  // Redis 설정
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10)
  }
};

// 필수 설정 검증
export function validateConfig() {
  const errors: string[] = [];

  // 기본 LINE 채널 설정 검증
  if (!config.line.channelAccessToken) {
    errors.push('LINE_CHANNEL_ACCESS_TOKEN이 필요합니다');
  }

  if (!config.line.channelSecret) {
    errors.push('LINE_CHANNEL_SECRET이 필요합니다');
  }

  // LINE 멀티 채널 설정 검증
  if (!config.line.channels.ilbMax.channelId) {
    errors.push('LINE_CHANNEL_ID_ILB_MAX가 필요합니다');
  }

  if (!config.line.channels.ilbMax.channelSecret) {
    errors.push('LINE_CHANNEL_SECRET_ILB_MAX가 필요합니다');
  }

  if (!config.line.channels.ilbMax.channelAccessToken) {
    errors.push('LINE_CHANNEL_ACCESS_TOKEN_ILB_MAX가 필요합니다');
  }

  if (!config.line.channels.max2max.channelId) {
    errors.push('LINE_CHANNEL_ID_MAX2MAX가 필요합니다');
  }

  if (!config.line.channels.max2max.channelSecret) {
    errors.push('LINE_CHANNEL_SECRET_MAX2MAX가 필요합니다');
  }

  if (!config.line.channels.max2max.channelAccessToken) {
    errors.push('LINE_CHANNEL_ACCESS_TOKEN_MAX2MAX가 필요합니다');
  }

  // Slack 설정 검증
  if (!config.slack.botToken) {
    errors.push('SLACK_BOT_TOKEN이 필요합니다');
  }

  if (!config.slack.channelId && !config.slack.channels.default) {
    errors.push('SLACK_CHANNEL_ID 또는 SLACK_CHANNEL_DEFAULT가 필요합니다');
  }

  // Slack 멀티 채널 설정 검증 (선택사항이지만 경고)
  const slackChannelWarnings: string[] = [];
  if (!config.slack.channels.baseball) {
    slackChannelWarnings.push('SLACK_CHANNEL_BASEBALL이 설정되지 않았습니다');
  }
  if (!config.slack.channels.soccer) {
    slackChannelWarnings.push('SLACK_CHANNEL_SOCCER가 설정되지 않았습니다');
  }
  if (!config.slack.channels.basketball) {
    slackChannelWarnings.push('SLACK_CHANNEL_BASKETBALL이 설정되지 않았습니다');
  }

  // Dialogflow 설정 검증
  if (!config.dialogflow.projectId) {
    errors.push('DIALOGFLOW_PROJECT_ID가 필요합니다');
  }

  if (!config.dialogflow.credentialsPath) {
    errors.push('GOOGLE_APPLICATION_CREDENTIALS이 필요합니다');
  }

  // LLM 설정 검증
  if (!config.llm.apiKey) {
    errors.push('LLM_API_KEY가 필요합니다');
  }

  if (!config.llm.apiUrl) {
    errors.push('LLM_API_URL이 필요합니다');
  }

  // 경고 메시지 출력 (선택사항)
  if (slackChannelWarnings.length > 0) {
    console.warn('Slack 채널 설정 경고:\n' + slackChannelWarnings.join('\n'));
  }

  // 필수 설정 오류가 있으면 예외 발생
  if (errors.length > 0) {
    throw new Error(`설정 오류:\n${errors.join('\n')}`);
  }
}