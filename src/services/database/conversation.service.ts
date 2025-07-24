import {
  Conversation,
  Prisma,
  ConversationStatus
} from '../../generated/prisma';
import { BaseService } from './base.service';
import { prisma } from './prisma';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  intent?: string;
  confidence?: number;
  // 추가 메타데이터
  messageId?: string;
  channelId?: string;
  processingTime?: number;
  tokens?: number;
  strategy?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSearchOptions {
  customerId?: string;
  status?: ConversationStatus[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  intents?: string[];
  minMessages?: number;
  maxMessages?: number;
}

export interface ConversationAnalytics {
  totalConversations: number;
  averageMessageCount: number;
  averageDuration: number;
  intentDistribution: Record<string, number>;
  completionRate: number;
  dropOffRate: number;
}

export class ConversationService extends BaseService<
  Conversation,
  Prisma.ConversationCreateInput,
  Prisma.ConversationUpdateInput,
  Prisma.ConversationWhereInput,
  Prisma.ConversationWhereUniqueInput,
  Prisma.ConversationOrderByWithRelationInput
> {
  protected model = prisma.conversation;
  protected modelName = 'Conversation';

  /**
   * 고객의 대화를 가져오거나 새로 생성합니다.
   * 채널별로 독립적인 세션을 관리할 수 있도록 개선
   */
  async getOrCreateConversation(
    customerId: string,
    sessionId: string,
    options?: {
      channelId?: string;
      forceNew?: boolean;
      sessionTimeout?: number; // 기본 2시간
    }
  ) {
    const { channelId, forceNew = false, sessionTimeout = 2 * 60 * 60 * 1000 } = options || {};

    // 강제 새 대화 생성이 아니면 활성 대화 찾기
    if (!forceNew) {
      const conversation = await this.findFirst({
        customerId,
        status: {
          in: [ConversationStatus.INITIAL, ConversationStatus.ACTIVE]
        },
        // 채널별 분리가 필요한 경우
        ...(channelId && {
          messages: {
            path: ['$[*].channelId'],
            equals: channelId
          }
        })
      });

      // 세션 타임아웃 확인
      const timeoutThreshold = new Date(Date.now() - sessionTimeout);
      if (conversation && conversation.lastActiveAt >= timeoutThreshold) {
        return conversation;
      }
    }

    // 새 대화 생성
    const initialMessage: ConversationMessage[] = channelId ? [{
      role: 'system',
      content: `New conversation started on channel: ${channelId}`,
      timestamp: new Date(),
      channelId,
      metadata: { sessionStart: true }
    }] : [];

    return await this.model.create({
      data: {
        customerId,
        sessionId,
        status: ConversationStatus.INITIAL,
        messages: initialMessage as unknown as Prisma.InputJsonValue
      }
    });
  }

  /**
   * 대화에 메시지를 추가합니다.
   * 메시지 ID 자동 생성 및 메타데이터 관리 개선
   */
  async addMessage(
    conversationId: string,
    message: ConversationMessage,
    options?: {
      maxMessages?: number; // 기본 50
      updateStatus?: boolean; // 기본 true
    }
  ) {
    const { maxMessages = 50, updateStatus = true } = options || {};

    const conversation = await this.findUnique({ id: conversationId });
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // 메시지 ID 자동 생성
    const enrichedMessage: ConversationMessage = {
      ...message,
      messageId: message.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || new Date()
    };

    const messages = (conversation.messages as unknown) as ConversationMessage[];
    messages.push(enrichedMessage);

    // 설정된 수만큼 메시지 유지 (중요 메시지는 보존)
    const importantMessages = messages.filter(m =>
      m.metadata?.important === true ||
      m.role === 'system'
    );
    const regularMessages = messages.filter(m =>
      !m.metadata?.important &&
      m.role !== 'system'
    );

    const trimmedMessages = [
      ...importantMessages,
      ...regularMessages.slice(-(maxMessages - importantMessages.length))
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 상태 업데이트 로직
    let status = conversation.status;
    if (updateStatus) {
      if (conversation.status === ConversationStatus.INITIAL && message.role === 'user') {
        status = ConversationStatus.ACTIVE;
      }
    }

    return await this.model.update({
      where: { id: conversationId },
      data: {
        messages: trimmedMessages as unknown as Prisma.InputJsonValue,
        status,
        lastActiveAt: new Date()
      }
    });
  }

  /**
   * 대화 메시지를 가져옵니다.
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const conversation = await this.findUnique({ id: conversationId });
    if (!conversation) {
      return [];
    }
    return (conversation.messages as unknown) as ConversationMessage[];
  }

  /**
   * 대화를 완료 처리합니다.
   */
  async completeConversation(conversationId: string) {
    return await this.model.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.COMPLETED,
        endedAt: new Date()
      }
    });
  }

  /**
   * 고객의 최근 대화 목록을 가져옵니다.
   */
  async getCustomerConversations(customerId: string, limit: number = 10) {
    return await this.findMany(
      { customerId },
      {
        limit,
        orderBy: { lastActiveAt: 'desc' }
      }
    );
  }

  /**
   * 오래된 대화를 정리합니다.
   */
  async cleanupOldConversations(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.model.deleteMany({
      where: {
        lastActiveAt: {
          lt: cutoffDate
        },
        status: ConversationStatus.COMPLETED
      }
    });
    return result.count;
  }

  /**
   * 대화 요약 정보를 가져옵니다.
   */
  async getConversationSummary(conversationId: string) {
    const conversation = await this.findUnique({ id: conversationId });
    if (!conversation) {
      return null;
    }

    const messages = (conversation.messages as unknown) as ConversationMessage[];
    return {
      id: conversation.id,
      status: conversation.status,
      messageCount: messages.length,
      startedAt: conversation.startedAt,
      lastActiveAt: conversation.lastActiveAt,
      duration: conversation.endedAt
        ? conversation.endedAt.getTime() - conversation.startedAt.getTime()
        : Date.now() - conversation.startedAt.getTime()
    };
  }

  /**
   * ID로 대화 조회
   */
  async findById(id: string): Promise<Conversation | null> {
    return this.findUnique({ id });
  }

  /**
   * 대화 검색 기능
   */
  async searchConversations(
    options: ConversationSearchOptions,
    pagination?: { page: number; limit: number }
  ) {
    const { page = 1, limit = 20 } = pagination || {};

    const where: Prisma.ConversationWhereInput = {};

    if (options.customerId) {
      where.customerId = options.customerId;
    }

    if (options.status?.length) {
      where.status = { in: options.status };
    }

    if (options.dateRange) {
      where.startedAt = {
        gte: options.dateRange.start,
        lte: options.dateRange.end
      };
    }

    // 인텐트 필터링 (JSON 쿼리)
    if (options.intents?.length) {
      where.messages = {
        path: ['$[*].intent'],
        array_contains: options.intents
      };
    }

    const conversations = await this.findManyWithPagination(
      where,
      { page, limit }
    );

    // 메시지 수 필터링 (post-processing)
    let filtered = conversations.data;
    if (options.minMessages !== undefined || options.maxMessages !== undefined) {
      filtered = filtered.filter(conv => {
        const messageCount = (conv.messages as unknown as ConversationMessage[]).length;
        return (
          (options.minMessages === undefined || messageCount >= options.minMessages) &&
          (options.maxMessages === undefined || messageCount <= options.maxMessages)
        );
      });
    }

    return {
      ...conversations,
      data: filtered
    };
  }

  /**
   * 대화 분석 통계
   */
  async getConversationAnalytics(
    customerId?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<ConversationAnalytics> {
    const where: Prisma.ConversationWhereInput = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (dateRange) {
      where.startedAt = {
        gte: dateRange.start,
        lte: dateRange.end
      };
    }

    const conversations = await this.findMany(where);

    if (conversations.length === 0) {
      return {
        totalConversations: 0,
        averageMessageCount: 0,
        averageDuration: 0,
        intentDistribution: {},
        completionRate: 0,
        dropOffRate: 0
      };
    }

    // 통계 계산
    let totalMessages = 0;
    let totalDuration = 0;
    let completedCount = 0;
    const intentCounts: Record<string, number> = {};

    conversations.forEach(conv => {
      const messages = (conv.messages as unknown as ConversationMessage[]);
      totalMessages += messages.length;

      // 지속 시간 계산
      if (conv.endedAt) {
        totalDuration += conv.endedAt.getTime() - conv.startedAt.getTime();
      } else {
        totalDuration += Date.now() - conv.startedAt.getTime();
      }

      // 완료율
      if (conv.status === ConversationStatus.COMPLETED) {
        completedCount++;
      }

      // 인텐트 분포
      messages.forEach(msg => {
        if (msg.intent) {
          intentCounts[msg.intent] = (intentCounts[msg.intent] || 0) + 1;
        }
      });
    });

    return {
      totalConversations: conversations.length,
      averageMessageCount: Math.round(totalMessages / conversations.length),
      averageDuration: Math.round(totalDuration / conversations.length),
      intentDistribution: intentCounts,
      completionRate: (completedCount / conversations.length) * 100,
      dropOffRate: ((conversations.length - completedCount) / conversations.length) * 100
    };
  }

  /**
   * 고객의 마지막 N개 메시지 가져오기
   */
  async getCustomerRecentMessages(
    customerId: string,
    limit: number = 10
  ): Promise<ConversationMessage[]> {
    const conversations = await this.getCustomerConversations(customerId, 5);
    const allMessages: ConversationMessage[] = [];

    for (const conv of conversations) {
      const messages = (conv.messages as unknown as ConversationMessage[]);
      allMessages.push(...messages);
    }

    // 시간순 정렬하여 최신 메시지 반환
    return allMessages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * 대화를 다른 상태로 전환
   */
  async transitionConversation(
    conversationId: string,
    newStatus: ConversationStatus,
    metadata?: Record<string, unknown>
  ) {
    const conversation = await this.findUnique({ id: conversationId });
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // 상태 전환 규칙 검증
    const validTransitions: Record<ConversationStatus, ConversationStatus[]> = {
      [ConversationStatus.INITIAL]: [ConversationStatus.ACTIVE, ConversationStatus.COMPLETED],
      [ConversationStatus.ACTIVE]: [ConversationStatus.COMPLETED],
      [ConversationStatus.COMPLETED]: [] // 완료된 대화는 변경 불가
    };

    if (!validTransitions[conversation.status].includes(newStatus)) {
      throw new Error(`Invalid status transition from ${conversation.status} to ${newStatus}`);
    }

    // 시스템 메시지 추가
    await this.addMessage(conversationId, {
      role: 'system',
      content: `Status changed from ${conversation.status} to ${newStatus}`,
      timestamp: new Date(),
      metadata: { ...metadata, statusTransition: true }
    });

    // 상태 업데이트
    return await this.model.update({
      where: { id: conversationId },
      data: {
        status: newStatus,
        ...(newStatus === ConversationStatus.COMPLETED && { endedAt: new Date() })
      }
    });
  }
}

export const conversationService = new ConversationService();