import { IntentCategory } from '../generated/prisma';
import { intentService } from '../services/database/intent.service';
import { config } from '../config';
import logger from '../utils/logger';
import * as dialogflow from '@google-cloud/dialogflow';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { google } from '@google-cloud/dialogflow/build/protos/protos';

// .env 파일 로드
dotenv.config();

// 타입 별칭 정의
type IIntent = google.cloud.dialogflow.v2.IIntent;
type ITrainingPhrase = google.cloud.dialogflow.v2.Intent.ITrainingPhrase;
type IPart = google.cloud.dialogflow.v2.Intent.TrainingPhrase.IPart;
type IParameter = google.cloud.dialogflow.v2.Intent.IParameter;
type IMessage = google.cloud.dialogflow.v2.Intent.IMessage;

/**
 * Dialogflow 인텐트를 DB에 자동으로 동기화하는 스크립트
 *
 * 사용법:
 * npx ts-node src/scripts/sync-intents.ts [region] [agent-name]
 *
 * 예시:
 * npx ts-node src/scripts/sync-intents.ts asia-northeast1 kalron-chatbot
 */

interface IntentMetadata {
  name: string;
  category: IntentCategory;
  automationRate: number;
  responseTemplate?: string;
  strategy: 'STATIC' | 'TEMPLATE' | 'DYNAMIC' | 'HYBRID';
  trainingPhrases?: string[];
  parameters?: Array<{
    name: string;
    entityType: string;
    required: boolean;
  }>;
}

class DialogflowIntentSync {
  private intentsClient: dialogflow.v2.IntentsClient;
  private projectId: string;
  private region: string;
  private agentName: string;

  constructor(region?: string, agentName?: string) {
    // .env에서 설정 읽기 (매개변수가 없으면 .env 값 사용)
    this.projectId = process.env.DIALOGFLOW_PROJECT_ID || config.dialogflow.projectId;
    this.region = region || 'asia-northeast1'; // 기본값
    this.agentName = agentName || this.projectId;

    // 자격 증명 경로 확인
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || config.dialogflow.credentialsPath;
    logger.info('Dialogflow configuration:', {
      projectId: this.projectId,
      region: this.region,
      agentName: this.agentName,
      credentialsPath,
      languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || 'ja-JP'
    });

    // Dialogflow 클라이언트 초기화
    this.intentsClient = new dialogflow.IntentsClient({
      keyFilename: path.resolve(credentialsPath)
    });
  }

  /**
   * Dialogflow에서 모든 인텐트 가져오기
   */
  async fetchIntentsFromDialogflow(): Promise<IIntent[]> {
    try {
      const projectAgentPath = this.intentsClient.projectAgentPath(this.projectId);
      const [intents] = await this.intentsClient.listIntents({
        parent: projectAgentPath,
        intentView: 'INTENT_VIEW_FULL'
      });

      logger.info(`Fetched ${intents.length} intents from Dialogflow`);
      return intents;
    } catch (error) {
      logger.error('Failed to fetch intents from Dialogflow', error);
      throw error;
    }
  }

  /**
   * 인텐트 카테고리 자동 분류
   */
  private categorizeIntent(intentName: string): IntentCategory {
    const name = intentName.toLowerCase();

    if (name.includes('결제') || name.includes('payment') || name.includes('영수증')) {
      return 'PAYMENT_DELIVERY';
    }
    if (name.includes('배송') || name.includes('delivery') || name.includes('송장')) {
      return 'PAYMENT_DELIVERY';
    }
    if (name.includes('디자인') || name.includes('design') || name.includes('시안')) {
      return 'DESIGN_INQUIRY';
    }
    if (name.includes('주문') || name.includes('order') || name.includes('견적')) {
      return 'ORDER_INQUIRY';
    }
    if (name.includes('샘플') || name.includes('sample')) {
      return 'SAMPLE_REQUEST';
    }
    if (name.includes('클레임') || name.includes('claim') || name.includes('불만') || name.includes('에러')) {
      return 'CLAIM';
    }
    if (name.includes('greeting') || name.includes('인사') || name.includes('안녕') ||
        name.includes('thanks') || name.includes('감사') || name.includes('goodbye')) {
      return 'GENERAL_INQUIRY';
    }

    return 'GENERAL_INQUIRY';
  }

  /**
   * 응답 전략 자동 결정
   */
  private determineStrategy(intent: IIntent): 'STATIC' | 'TEMPLATE' | 'DYNAMIC' | 'HYBRID' {
    const name = intent.displayName?.toLowerCase() || '';
    const hasParameters = (intent.parameters?.length || 0) > 0;
    const hasContexts = (intent.outputContexts?.length || 0) > 0;

    // 정적 응답이 적합한 경우
    if (name.includes('greeting') || name.includes('goodbye') || name.includes('thanks') ||
        name.includes('영수증_분리') || name.includes('계좌송금_수수료')) {
      return 'STATIC';
    }

    // 템플릿 응답이 적합한 경우
    if (hasParameters && !hasContexts) {
      return 'TEMPLATE';
    }

    // 동적 응답이 필요한 경우
    if (name.includes('디자인') || name.includes('design') || name.includes('상담')) {
      return 'DYNAMIC';
    }

    // 하이브리드 응답이 적합한 경우
    if (hasParameters && hasContexts) {
      return 'HYBRID';
    }

    return 'DYNAMIC';
  }

  /**
   * 자동화율 추정
   */
  private estimateAutomationRate(intent: IIntent): number {
    const name = intent.displayName?.toLowerCase() || '';
    const category = this.categorizeIntent(name);

    // 카테고리별 기본 자동화율
    const categoryRates: Record<string, number> = {
      'GENERAL_INQUIRY': 100,
      'DESIGN_INQUIRY': 20,
      'ORDER_INQUIRY': 50,
      'SAMPLE_REQUEST': 100,
      'PAYMENT_DELIVERY': 80,
      'CLAIM': 30,
      'OTHER': 50
    };

    // 특정 인텐트는 수동 조정
    if (name.includes('ui_에러') || name.includes('실패')) {
      return 50;
    }
    if (name.includes('greeting') || name.includes('goodbye') || name.includes('thanks')) {
      return 100;
    }

    return categoryRates[category] || 50;
  }

  /**
   * Training Phrases 추출
   */
  private extractTrainingPhrases(intent: IIntent): string[] {
    const phrases: string[] = [];

    intent.trainingPhrases?.forEach((tp: ITrainingPhrase) => {
      const parts = tp.parts || [];
      const phrase = parts.map((part: IPart) => part.text || '').join('');
      if (phrase) {
        phrases.push(phrase);
      }
    });

    return phrases;
  }

  /**
   * 파라미터 정보 추출
   */
  private extractParameters(intent: IIntent) {
    return intent.parameters?.map((param: IParameter) => ({
      name: param.displayName || '',
      entityType: param.entityTypeDisplayName || '',
      required: param.mandatory || false
    })) || [];
  }

  /**
   * Dialogflow 인텐트를 DB 메타데이터로 변환
   */
  private convertToMetadata(intent: IIntent): IntentMetadata {
    const name = intent.displayName || '';
    const category = this.categorizeIntent(name);
    const strategy = this.determineStrategy(intent);
    const automationRate = this.estimateAutomationRate(intent);
    const trainingPhrases = this.extractTrainingPhrases(intent);
    const parameters = this.extractParameters(intent);

    // 기본 응답 템플릿 생성 (필요한 경우)
    let responseTemplate: string | undefined;
    if (strategy === 'STATIC' && intent.messages?.length) {
      // Dialogflow의 기본 응답을 템플릿으로 사용
      const textResponse = intent.messages.find((msg: IMessage) => msg.text);
      if (textResponse?.text?.text?.length) {
        responseTemplate = textResponse.text.text[0];
      }
    }

    return {
      name,
      category,
      automationRate,
      strategy,
      responseTemplate,
      trainingPhrases,
      parameters
    };
  }

  /**
   * DB와 동기화
   */
  async syncToDatabase(intents: IIntent[]) {
    logger.info('Starting database synchronization...');

    const metadataList: IntentMetadata[] = [];

    for (const intent of intents) {
      // 시스템 인텐트는 제외
      if (intent.displayName?.startsWith('Default')) {
        continue;
      }

      const metadata = this.convertToMetadata(intent);
      metadataList.push(metadata);

      // 변형 버전도 추가 (결제 관련 인텐트)
      if (metadata.name.includes('_변형')) {
        // 이미 변형이면 스킵
        continue;
      }
      if (metadata.name.startsWith('결제_')) {
        metadataList.push({
          ...metadata,
          name: `${metadata.name}_변형`
        });
      }
    }

    // DB에 일괄 저장
    const createData = metadataList.map(intent => ({
      name: intent.name,
      category: intent.category,
      automationRate: intent.automationRate,
      responseTemplate: intent.responseTemplate || null,
      isActive: true
    }));

    const result = await intentService.bulkCreate(createData);
    logger.info(`Successfully synced ${result} intents to database`);

    // 메타데이터 업데이트
    for (const metadata of metadataList) {
      // 메모리 캐시에 저장
      intentService.updateMetadata(metadata.name, {
        strategy: metadata.strategy,
        cacheEnabled: metadata.strategy === 'STATIC',
        cacheDuration: metadata.strategy === 'STATIC' ? 3600 : undefined,
        contextRequired: metadata.strategy === 'DYNAMIC' ? ['conversationHistory'] : [],
        examples: metadata.trainingPhrases?.slice(0, 5).map(phrase => ({
          question: phrase,
          answer: metadata.responseTemplate || ''
        }))
      });

      // FAQ 템플릿 생성 (STATIC 인텐트만)
      if (metadata.strategy === 'STATIC' && metadata.responseTemplate) {
        logger.info(`Created FAQ template for ${metadata.name}`);
      }
    }

    logger.info('Intent metadata updated successfully');

    // 동기화 리포트 생성
    this.generateSyncReport(metadataList);
  }

  /**
   * 동기화 리포트 생성
   */
  private generateSyncReport(intents: IntentMetadata[]) {
    const report = {
      total: intents.length,
      byCategory: {} as Record<IntentCategory, number>,
      byStrategy: {} as Record<string, number>,
      automationStats: {
        full: 0,
        partial: 0,
        manual: 0
      }
    };

    intents.forEach(intent => {
      // 카테고리별 집계
      report.byCategory[intent.category] = (report.byCategory[intent.category] || 0) + 1;

      // 전략별 집계
      report.byStrategy[intent.strategy] = (report.byStrategy[intent.strategy] || 0) + 1;

      // 자동화율 집계
      if (intent.automationRate >= 80) {
        report.automationStats.full++;
      } else if (intent.automationRate >= 50) {
        report.automationStats.partial++;
      } else {
        report.automationStats.manual++;
      }
    });

    logger.info('=== Dialogflow Sync Report ===');
    logger.info(`Total Intents: ${report.total}`);
    logger.info('By Category:', report.byCategory);
    logger.info('By Strategy:', report.byStrategy);
    logger.info('Automation Stats:', report.automationStats);
  }

  /**
   * 메인 동기화 실행
   */
  async run() {
    try {
      logger.info(`Starting Dialogflow sync for project: ${this.projectId}`);
      logger.info(`Region: ${this.region}, Agent: ${this.agentName}`);

      // 1. Dialogflow에서 인텐트 가져오기
      const intents = await this.fetchIntentsFromDialogflow();

      // 2. DB와 동기화
      await this.syncToDatabase(intents);

      logger.info('Dialogflow sync completed successfully');
    } catch (error) {
      logger.error('Dialogflow sync failed', error);
      throw error;
    }
  }
}

// 스크립트 실행
if (require.main === module) {
  const args = process.argv.slice(2);

  // .env 설정이 있으면 매개변수 없이도 실행 가능
  if (args.length === 0 && process.env.DIALOGFLOW_PROJECT_ID) {
    logger.info('Using settings from .env file');
    const sync = new DialogflowIntentSync();
    sync.run()
      .then(() => {
        logger.info('Sync completed');
        process.exit(0);
      })
      .catch(error => {
        logger.error('Sync failed', error);
        process.exit(1);
      });
  } else if (args.length < 2) {
    console.error('Usage: npx ts-node sync-intents.ts [region] [agent-name]');
    console.error('Example: npx ts-node sync-intents.ts asia-northeast1 kalron-chatbot');
    console.error('\nOr set DIALOGFLOW_PROJECT_ID in .env to use default settings');
    process.exit(1);
  } else {
    const [region, agentName] = args;
    const sync = new DialogflowIntentSync(region, agentName);
    sync.run()
      .then(() => {
        logger.info('Sync completed');
        process.exit(0);
      })
      .catch(error => {
        logger.error('Sync failed', error);
        process.exit(1);
      });
  }
}

export { DialogflowIntentSync };