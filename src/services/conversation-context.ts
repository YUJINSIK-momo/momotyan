import logger from '../utils/logger';
import { conversationService, ConversationMessage } from './database';
import { ConversationStatus } from '../generated/prisma';

export enum ConversationState {
  INITIAL = 'INITIAL',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED'
}

export interface ConversationContext {
  customerId: string;
  sessionId: string;
  conversationId: string;
  state: ConversationState;
  conversationHistory: ConversationEntry[];
  metadata: {
    startTime: Date;
    lastUpdateTime: Date;
    language: string;
    channelId?: string;
    brand?: string;
    sportType?: string;
    teamName?: string;
    customerType?: string;
    currentIntent?: string;
    lastIntent?: string;
    messageCount: number;
    userMessageCount: number;
  };
  tempData: Record<string, unknown>;
  // 추가 컨텍스트 정보
  customerContext?: {
    recentOrders?: Array<{ orderNumber: string; status: string; date: Date }>;
    recentDesigns?: Array<{ id: string; status: string; date: Date }>;
    lastPayment?: { amount: number; date: Date; method: string };
    preferences?: Record<string, unknown>;
  };
}

export interface ConversationEntry {
  messageId?: string;
  timestamp: Date;
  role: 'user' | 'bot' | 'system';
  message: string;
  intent?: string;
  confidence?: number;
  processingTime?: number;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

export class ConversationContextService {
  // 데이터베이스 기반 저장소로 변경
  private readonly CONTEXT_TTL = 7200000; // 2시간 (밀리초)
  private cleanupInterval: NodeJS.Timeout;
  // 컨텍스트 캐시 (빠른 접근을 위해)
  private contextCache: Map<string, ConversationContext> = new Map();
  private readonly CACHE_TTL = 300000; // 5분 캐시

  constructor() {
    // 30분마다 만료된 컨텍스트 정리
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredContexts();
    }, 1800000);
  }

  /**
   * 대화 컨텍스트 가져오기 또는 생성
   * 고객 정보와 최근 주문/디자인 정보 포함
   */
  async getOrCreateContext(
    customerId: string,
    sessionId: string,
    options?: {
      channelId?: string;
      forceNew?: boolean;
      includeCustomerContext?: boolean;
    }
  ): Promise<ConversationContext> {
    try {
      const cacheKey = `${customerId}:${sessionId}`;

      // 캐시 확인 (forceNew가 아닌 경우)
      if (!options?.forceNew) {
        const cached = this.contextCache.get(cacheKey);
        if (cached && (Date.now() - cached.metadata.lastUpdateTime.getTime() < this.CACHE_TTL)) {
          logger.debug(`Using cached context for ${customerId}`);
          return cached;
        }
      }

      // DB에서 대화 가져오기 또는 생성
      const conversation = await conversationService.getOrCreateConversation(
        customerId,
        sessionId,
        {
          channelId: options?.channelId,
          forceNew: options?.forceNew
        }
      );

      // 고객 정보 가져오기
      const customer = await this.getCustomerInfo(customerId);

      // DB 데이터를 ConversationContext 형식으로 변환
      const messages = (conversation.messages as unknown) as ConversationMessage[];
      const conversationHistory: ConversationEntry[] = messages.map(msg => ({
        messageId: msg.messageId,
        timestamp: msg.timestamp,
        role: msg.role === 'user' ? 'user' as const : msg.role === 'assistant' ? 'bot' as const : 'system' as const,
        message: msg.content,
        intent: msg.intent,
        confidence: msg.confidence,
        processingTime: msg.processingTime,
        channelId: msg.channelId,
        metadata: msg.metadata
      }));

      // 인텐트 분석
      const userMessages = messages.filter(m => m.role === 'user');
      const lastUserMessage = userMessages[userMessages.length - 1];
      const previousUserMessage = userMessages[userMessages.length - 2];

      const context: ConversationContext = {
        customerId,
        sessionId,
        conversationId: conversation.id,
        state: this.mapDbStatusToState(conversation.status),
        conversationHistory,
        metadata: {
          startTime: conversation.startedAt,
          lastUpdateTime: conversation.lastActiveAt,
          language: 'ja',
          channelId: options?.channelId,
          brand: customer?.brand || undefined,
          sportType: customer?.sportType || undefined,
          teamName: customer?.teamName || undefined,
          customerType: customer?.customerType || undefined,
          currentIntent: lastUserMessage?.intent,
          lastIntent: previousUserMessage?.intent,
          messageCount: messages.length,
          userMessageCount: userMessages.length
        },
        tempData: this.tempDataStore.get(cacheKey) || {}
      };

      // 고객 컨텍스트 추가 (필요시)
      if (options?.includeCustomerContext) {
        context.customerContext = await this.getCustomerContext(customerId);
      }

      // 캐시 업데이트
      this.contextCache.set(cacheKey, context);

      logger.debug(`Retrieved context for ${customerId}`, {
        conversationId: conversation.id,
        messageCount: messages.length,
        state: context.state
      });

      return context;
    } catch (error) {
      logger.error('Failed to get/create context:', error);
      throw error;
    }
  }

  /**
   * 대화 상태 업데이트
   */
  async updateState(
    customerId: string,
    sessionId: string,
    newState: ConversationState
  ): Promise<ConversationContext> {
    try {
      // DB에서 대화 가져오기
      const conversation = await conversationService.getOrCreateConversation(customerId, sessionId);

      // 상태 업데이트
      const dbStatus = this.mapStateToDbStatus(newState);
      await conversationService.update({ id: conversation.id }, { status: dbStatus });

      // 컨텍스트 반환
      const context = await this.getOrCreateContext(customerId, sessionId);
      logger.debug(`Updated state to ${newState} for ${customerId}`);
      return context;
    } catch (error) {
      logger.error('Failed to update state:', error);
      throw error;
    }
  }

  /**
   * 대화 항목 추가 (향상된 버전)
   * 채널 정보와 처리 시간 등 추가 메타데이터 포함
   */
  async addConversationEntry(
    customerId: string,
    sessionId: string,
    entry: ConversationEntry,
    options?: {
      updateCache?: boolean;
      important?: boolean;
    }
  ): Promise<ConversationContext> {
    try {
      const startTime = Date.now();

      // DB에서 대화 가져오기
      const conversation = await conversationService.getOrCreateConversation(customerId, sessionId);

      // 메시지 추가
      const message: ConversationMessage = {
        messageId: entry.messageId,
        role: entry.role === 'user' ? 'user' : entry.role === 'system' ? 'system' : 'assistant',
        content: entry.message,
        timestamp: entry.timestamp || new Date(),
        intent: entry.intent,
        confidence: entry.confidence,
        processingTime: entry.processingTime || (Date.now() - startTime),
        channelId: entry.channelId,
        metadata: {
          ...entry.metadata,
          important: options?.important
        }
      };

      await conversationService.addMessage(conversation.id, message);

      // 캐시 무효화
      const cacheKey = `${customerId}:${sessionId}`;
      if (options?.updateCache !== false) {
        this.contextCache.delete(cacheKey);
      }

      // 업데이트된 컨텍스트 반환
      const context = await this.getOrCreateContext(customerId, sessionId);

      // 중요 메시지인 경우 로깅
      if (options?.important) {
        logger.info('Important message added', {
          customerId,
          conversationId: conversation.id,
          intent: entry.intent,
          role: entry.role
        });
      }

      return context;
    } catch (error) {
      logger.error('Failed to add conversation entry:', error);
      throw error;
    }
  }

  /**
   * 임시 데이터 업데이트
   * 데이터베이스에는 저장하지 않고 메모리에만 유지
   */
  private tempDataStore: Map<string, Record<string, unknown>> = new Map();

  async updateTempData(
    customerId: string,
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<ConversationContext> {
    try {
      const key = `${customerId}:${sessionId}`;
      const existingData = this.tempDataStore.get(key) || {};

      this.tempDataStore.set(key, {
        ...existingData,
        ...data
      });

      const context = await this.getOrCreateContext(customerId, sessionId);
      context.tempData = this.tempDataStore.get(key) || {};

      return context;
    } catch (error) {
      logger.error('Failed to update temp data:', error);
      throw error;
    }
  }

  /**
   * 컨텍스트 지우기 (대화 종료)
   */
  async clearContext(customerId: string, sessionId: string): Promise<void> {
    try {
      // DB에서 대화 완료 처리
      const conversation = await conversationService.getOrCreateConversation(customerId, sessionId);
      await conversationService.completeConversation(conversation.id);

      // 임시 데이터 삭제
      const key = `${customerId}:${sessionId}`;
      this.tempDataStore.delete(key);

      logger.info(`Cleared context for ${customerId}`);
    } catch (error) {
      logger.error('Failed to clear context:', error);
    }
  }

  /**
   * 대화 요약 가져오기
   */
  getConversationSummary(context: ConversationContext): string {
    const duration = Math.floor(
      (Date.now() - context.metadata.startTime.getTime()) / (1000 * 60)
    );

    return `대화 시간: ${duration}분\n` + // 대화 시간
           `메시지 수: ${context.conversationHistory.length}\n` + // 메시지 수
           `현재 상태: ${this.getStateDisplayName(context.state)}`; // 현재 상태
  }

  /**
   * 데이터베이스 상태를 ConversationState로 매핑
   */
  private mapDbStatusToState(status: ConversationStatus): ConversationState {
    switch (status) {
    case ConversationStatus.INITIAL:
      return ConversationState.INITIAL;
    case ConversationStatus.ACTIVE:
      return ConversationState.ACTIVE;
    case ConversationStatus.COMPLETED:
      return ConversationState.COMPLETED;
    default:
      return ConversationState.INITIAL;
    }
  }

  /**
   * ConversationState를 데이터베이스 상태로 매핑
   */
  private mapStateToDbStatus(state: ConversationState): ConversationStatus {
    switch (state) {
    case ConversationState.INITIAL:
      return ConversationStatus.INITIAL;
    case ConversationState.ACTIVE:
      return ConversationStatus.ACTIVE;
    case ConversationState.COMPLETED:
      return ConversationStatus.COMPLETED;
    default:
      return ConversationStatus.INITIAL;
    }
  }

  /**
   * 만료된 컨텍스트 정리
   */
  private async cleanupExpiredContexts(): Promise<void> {
    try {
      // 오래된 대화 정리 (30일 이상)
      const deletedCount = await conversationService.cleanupOldConversations(30);

      // 오래된 캐시 정리
      let cachesCleaned = 0;
      const now = Date.now();

      for (const [key, context] of this.contextCache.entries()) {
        if (now - context.metadata.lastUpdateTime.getTime() > this.CACHE_TTL) {
          this.contextCache.delete(key);
          cachesCleaned++;
        }
      }

      // 오래된 임시 데이터 정리
      let tempDataCleaned = 0;
      const tempDataTimestamps = new Map<string, number>();

      // 업데이트 시간 추적
      for (const [key, _] of this.tempDataStore.entries()) {
        const lastUpdate = tempDataTimestamps.get(key) || 0;
        if (now - lastUpdate > this.CONTEXT_TTL) {
          this.tempDataStore.delete(key);
          tempDataTimestamps.delete(key);
          tempDataCleaned++;
        }
      }

      if (deletedCount > 0 || cachesCleaned > 0 || tempDataCleaned > 0) {
        logger.info('Cleanup complete', {
          deletedConversations: deletedCount,
          cleanedCaches: cachesCleaned,
          cleanedTempData: tempDataCleaned
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired contexts:', error);
    }
  }

  /**
   * 대화 상태에 대한 표시 이름 가져오기
   */
  private getStateDisplayName(state: ConversationState): string {
    const stateNames: { [key in ConversationState]: string } = {
      [ConversationState.INITIAL]: '시작', // 시작
      [ConversationState.ACTIVE]: '진행 중', // 진행 중
      [ConversationState.COMPLETED]: '완료' // 완료
    };

    return stateNames[state] || state;
  }

  /**
   * 고객 정보 가져오기
   */
  private async getCustomerInfo(customerId: string) {
    try {
      const { customerService } = await import('./database');
      return await customerService.findByLineUserId(customerId);
    } catch (error) {
      logger.error('Failed to get customer info:', error);
      return null;
    }
  }

  /**
   * 고객 컨텍스트 가져오기 (최근 주문, 디자인, 결제 정보)
   */
  private async getCustomerContext(customerId: string) {
    try {
      const { orderTrackingService, designRequestService, paymentService } = await import('./database');

      // 병렬로 데이터 가져오기
      const [orders, designs, payments] = await Promise.all([
        orderTrackingService.findMany(
          { customerId },
          { orderBy: { createdAt: 'desc' }, limit: 5 }
        ),
        designRequestService.findMany(
          { customerId },
          { orderBy: { createdAt: 'desc' }, limit: 5 }
        ),
        paymentService.findMany(
          { customerId },
          { orderBy: { createdAt: 'desc' }, limit: 1 }
        )
      ]);

      return {
        recentOrders: orders.map(o => ({
          orderNumber: o.id,
          status: o.status,
          date: o.createdAt
        })),
        recentDesigns: designs.map(d => ({
          id: d.id,
          status: d.status,
          date: d.createdAt
        })),
        lastPayment: payments[0] ? {
          amount: payments[0].actualPaymentAmount,
          date: payments[0].createdAt,
          method: payments[0].paymentMethod || 'UNKNOWN'
        } : undefined
      };
    } catch (error) {
      logger.error('Failed to get customer context:', error);
      return {};
    }
  }

  /**
   * 대화 요약 및 통계 가져오기
   */
  async getConversationStats(conversationId: string) {
    try {
      const conversation = await conversationService.getConversationSummary(conversationId);
      if (!conversation) {
        return null;
      }

      const messages = await conversationService.getMessages(conversationId);

      // 인텐트 분포 계산
      const intentCounts: Record<string, number> = {};
      const responseTimes: number[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        // 인텐트 카운트
        if (msg.intent) {
          intentCounts[msg.intent] = (intentCounts[msg.intent] || 0) + 1;
        }

        // 응답 시간 계산 (user 메시지 다음의 bot 메시지)
        if (msg.role === 'assistant' && i > 0 && messages[i-1].role === 'user') {
          const responseTime = msg.timestamp.getTime() - messages[i-1].timestamp.getTime();
          responseTimes.push(responseTime);
        }
      }

      // 평균 응답 시간
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      return {
        ...conversation,
        intentDistribution: intentCounts,
        avgResponseTime: Math.round(avgResponseTime),
        totalIntents: Object.keys(intentCounts).length,
        topIntent: Object.entries(intentCounts)
          .sort(([,a], [,b]) => b - a)[0]?.[0]
      };
    } catch (error) {
      logger.error('Failed to get conversation stats:', error);
      return null;
    }
  }

  /**
   * 서비스 종료 시 정리
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    // 캐시 정리
    this.contextCache.clear();
    this.tempDataStore.clear();
  }

  /**
   * 대화 정보 가져오기
   */
  async getConversationInfo(conversationId: string) {
    try {
      const conversation = await conversationService.findById(conversationId);
      return conversation;
    } catch (error) {
      logger.error('Failed to get conversation info:', error);
      return null;
    }
  }

  /**
   * 최근 메시지 가져오기
   */
  async getRecentMessages(conversationId: string, limit: number = 10): Promise<ConversationMessage[]> {
    try {
      const conversation = await conversationService.findById(conversationId);
      if (!conversation || !conversation.messages) {
        return [];
      }

      const messages = (conversation.messages as unknown) as ConversationMessage[];
      return messages.slice(-limit);
    } catch (error) {
      logger.error('Failed to get recent messages:', error);
      return [];
    }
  }

  /**
   * 메시지 추가 (간편 메서드)
   */
  async addMessage(
    conversationId: string,
    _userId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: { intent?: string; confidence?: number; strategy?: string }
  ): Promise<void> {
    try {
      const message: ConversationMessage = {
        role,
        content,
        timestamp: new Date(),
        intent: metadata?.intent,
        confidence: metadata?.confidence
      };

      await conversationService.addMessage(conversationId, message);
    } catch (error) {
      logger.error('Failed to add message:', error);
    }
  }
}

// 싱글톤 인스턴스 내보내기
export const conversationContextService = new ConversationContextService();

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  conversationContextService.destroy();
});

process.on('SIGTERM', () => {
  conversationContextService.destroy();
});