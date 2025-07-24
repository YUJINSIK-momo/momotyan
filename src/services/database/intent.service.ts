import { Intent, IntentCategory, Prisma } from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';
import logger from '../../utils/logger';

export interface IntentResponseStrategy {
  strategy: 'STATIC' | 'TEMPLATE' | 'DYNAMIC' | 'HYBRID';
  cacheEnabled: boolean;
  cacheDuration?: number;
  contextRequired: string[];
}

// 프롬프트 템플릿과 기타 메타데이터를 별도로 관리
interface IntentMetadata {
  strategy?: string;
  cacheEnabled?: boolean;
  cacheDuration?: number;
  contextRequired?: string[];
  promptTemplate?: string;
  examples?: Array<{
    question: string;
    answer: string;
  }>;
  createdFrom?: string;
}

class IntentService extends BaseService<
  Intent,
  Prisma.IntentCreateInput,
  Prisma.IntentUpdateInput,
  Prisma.IntentWhereInput,
  Prisma.IntentWhereUniqueInput,
  Prisma.IntentOrderByWithRelationInput
> {
  protected model = prisma.intent;
  protected modelName = 'Intent';

  // 메타데이터를 메모리에 캐싱 (DB 스키마에 없는 필드들)
  private metadataCache: Map<string, IntentMetadata> = new Map();

  /**
   * 인텐트 이름으로 조회
   */
  async findByName(intentName: string): Promise<Intent | null> {
    try {
      const intent = await this.findUnique({ name: intentName });
      return intent;
    } catch (error) {
      logger.error('Error finding intent by name:', error);
      return null;
    }
  }

  /**
   * 카테고리별 인텐트 목록 조회
   */
  async findByCategory(category: IntentCategory): Promise<Intent[]> {
    return this.findMany(
      { category },
      { orderBy: { name: 'asc' } }
    );
  }

  /**
   * 인텐트 응답 전략 조회 (Lazy Loading)
   * Dialogflow에서 새로운 인텐트가 감지되면 자동으로 기본값 생성
   */
  async getResponseStrategy(intentName: string): Promise<IntentResponseStrategy> {
    let intent = await this.findByName(intentName);

    if (!intent) {
      // DB에 없으면 자동 생성 (Lazy Loading)
      logger.info(`Creating default metadata for new intent: ${intentName}`);

      const defaultStrategy = this.getDefaultStrategy(intentName);

      try {
        intent = await this.model.create({
          data: {
            name: intentName,
            category: this.inferCategory(intentName),
            automationRate: 100,
            responseTemplate: null,
            isActive: true
          }
        });

        // 메타데이터 캐싱
        this.metadataCache.set(intentName, {
          strategy: defaultStrategy.strategy,
          cacheEnabled: defaultStrategy.cacheEnabled,
          cacheDuration: defaultStrategy.cacheDuration,
          contextRequired: defaultStrategy.contextRequired,
          createdFrom: 'dialogflow-detection'
        });
      } catch (error) {
        logger.warn(`Failed to create intent metadata: ${intentName}`, error);
        return defaultStrategy;
      }
    }

    // 캐시에서 메타데이터 조회
    const cachedMetadata = this.metadataCache.get(intentName);
    if (cachedMetadata) {
      return {
        strategy: (cachedMetadata.strategy as IntentResponseStrategy['strategy']) || 'DYNAMIC',
        cacheEnabled: cachedMetadata.cacheEnabled || false,
        cacheDuration: cachedMetadata.cacheDuration,
        contextRequired: cachedMetadata.contextRequired || []
      };
    }

    // 캐시에 없으면 기본값 반환
    return this.getDefaultStrategy(intentName);
  }

  /**
   * 인텐트 이름 기반으로 기본 전략 결정
   */
  private getDefaultStrategy(intentName: string): IntentResponseStrategy {
    // 인텐트 이름 패턴 기반 기본 전략
    if (intentName.includes('greeting') || intentName.includes('goodbye')) {
      return {
        strategy: 'STATIC',
        cacheEnabled: true,
        cacheDuration: 3600,
        contextRequired: []
      };
    }

    if (intentName.includes('price') || intentName.includes('delivery')) {
      return {
        strategy: 'TEMPLATE',
        cacheEnabled: true,
        cacheDuration: 600,
        contextRequired: ['teamName', 'sportType']
      };
    }

    if (intentName.includes('design') || intentName.includes('order')) {
      return {
        strategy: 'HYBRID',
        cacheEnabled: false,
        contextRequired: ['teamName', 'conversationHistory']
      };
    }

    // 기본값
    return {
      strategy: 'DYNAMIC',
      cacheEnabled: false,
      contextRequired: []
    };
  }

  /**
   * 인텐트 이름으로 카테고리 추론
   */
  private inferCategory(intentName: string): IntentCategory {
    if (intentName.includes('greeting') || intentName.includes('goodbye')) {
      return 'GENERAL_INQUIRY';
    }
    if (intentName.includes('design')) {
      return 'DESIGN_INQUIRY';
    }
    if (intentName.includes('order')) {
      return 'ORDER_INQUIRY';
    }
    if (intentName.includes('sample')) {
      return 'SAMPLE_REQUEST';
    }
    if (intentName.includes('payment') || intentName.includes('delivery')) {
      return 'PAYMENT_DELIVERY';
    }
    if (intentName.includes('claim') || intentName.includes('complaint')) {
      return 'CLAIM';
    }
    // 기본값은 GENERAL_INQUIRY
    return 'GENERAL_INQUIRY';
  }

  /**
   * 인텐트별 자동화율 업데이트
   */
  async updateAutomationRate(intentName: string, rate: number): Promise<Intent | null> {
    const intent = await this.findByName(intentName);
    if (!intent) {
      return null;
    }

    return this.update(
      { id: intent.id },
      { automationRate: Math.min(100, Math.max(0, rate)) }
    );
  }

  /**
   * 응답 템플릿 업데이트
   */
  async updateResponseTemplate(
    intentName: string,
    responseTemplate: string
  ): Promise<Intent | null> {
    const intent = await this.findByName(intentName);
    if (!intent) {
      return null;
    }

    return this.update(
      { id: intent.id },
      { responseTemplate }
    );
  }

  /**
   * 프롬프트 템플릿 업데이트 (메타데이터에 저장)
   */
  async updatePromptTemplate(
    intentName: string,
    promptTemplate: string
  ): Promise<void> {
    const intent = await this.findByName(intentName);
    if (!intent) {
      throw new Error(`Intent not found: ${intentName}`);
    }

    // 메타데이터 캐시 업데이트
    const metadata = this.metadataCache.get(intentName) || {};
    metadata.promptTemplate = promptTemplate;
    this.metadataCache.set(intentName, metadata);

    logger.info(`Updated prompt template for intent: ${intentName}`);
  }

  /**
   * 메타데이터 가져오기
   */
  getMetadata(intentName: string): IntentMetadata | undefined {
    return this.metadataCache.get(intentName);
  }

  /**
   * 메타데이터 업데이트
   */
  updateMetadata(intentName: string, metadata: Partial<IntentMetadata>): void {
    const existing = this.metadataCache.get(intentName) || {};
    this.metadataCache.set(intentName, { ...existing, ...metadata });
  }

  /**
   * 자주 사용되는 인텐트 목록
   */
  async getFrequentIntents(limit: number = 10): Promise<Intent[]> {
    return this.findMany(
      {
        automationRate: { gte: 80 },
        isActive: true
      },
      {
        orderBy: { automationRate: 'desc' },
        limit
      }
    );
  }

  /**
   * 인텐트 일괄 생성 (초기 설정용)
   */
  async bulkCreate(intents: Prisma.IntentCreateInput[]): Promise<number> {
    const result = await this.model.createMany({
      data: intents,
      skipDuplicates: true
    });

    logger.info(`Bulk created ${result.count} intents`);
    return result.count;
  }
}

export const intentService = new IntentService();