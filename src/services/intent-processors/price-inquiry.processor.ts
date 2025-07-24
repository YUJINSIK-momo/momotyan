import { BaseIntentProcessor, ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService } from '../database';
import logger from '../../utils/logger';

interface PriceInfo {
  sport: string;
  minPrice: number;
  maxPrice: number;
  unit: string;
  minimumQuantity: number;
  additionalInfo?: string;
}

/**
 * 가격 문의 인텐트 처리기
 */
export class PriceInquiryProcessor extends BaseIntentProcessor {
  // 스포츠별 기본 가격 정보 (실제로는 DB나 설정에서 가져와야 함)
  private readonly priceInfo: Record<string, PriceInfo> = {
    BASEBALL: {
      sport: '야구',
      minPrice: 50000,
      maxPrice: 150000,
      unit: '원',
      minimumQuantity: 15,
      additionalInfo: '상의, 하의, 모자 세트 기준'
    },
    SOCCER: {
      sport: '축구',
      minPrice: 40000,
      maxPrice: 120000,
      unit: '원',
      minimumQuantity: 15,
      additionalInfo: '상의, 하의 세트 기준'
    },
    BASKETBALL: {
      sport: '농구',
      minPrice: 45000,
      maxPrice: 130000,
      unit: '원',
      minimumQuantity: 12,
      additionalInfo: '상의, 하의 세트 기준'
    }
  };

  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    logger.info('Processing price inquiry', {
      userId: context.userId,
      intent: context.intent.intentName
    });

    return this.baseProcess(context);
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const gatheredData: Record<string, unknown> = {};

    try {
      // 1. 고객 정보 조회
      const customer = await customerService.findByLineUserId(context.userId);

      if (customer) {
        gatheredData.customerName = customer.lineUserName || '고객님';
        gatheredData.teamName = customer.teamName;
        gatheredData.sportType = customer.sportType;
        gatheredData.brand = customer.brand;
        gatheredData.isExistingCustomer = customer.customerType === 'EXISTING';

        // 2. 이전 주문 내역 조회 (있다면)
        if (customer.id) {
          const previousOrders = await this.getPreviousOrders(customer.id);
          gatheredData.hasPreviousOrders = previousOrders.length > 0;
          gatheredData.previousOrderCount = previousOrders.length;

          if (previousOrders.length > 0) {
            // 최근 주문 정보
            const lastOrder = previousOrders[0] as { createdAt: Date; totalAmount: number };
            gatheredData.lastOrderDate = lastOrder.createdAt;
            gatheredData.lastOrderAmount = lastOrder.totalAmount;
          }
        }
      }

      // 3. Dialogflow에서 추출한 파라미터
      if (context.intent.parameters) {
        gatheredData.requestedSport = context.intent.parameters.sport;
        gatheredData.requestedQuantity = context.intent.parameters.quantity;
        gatheredData.requestedDesignType = context.intent.parameters.designType;
      }

      // 4. 가격 정보 준비
      const sportType = (gatheredData.requestedSport ||
                       gatheredData.sportType ||
                       'BASEBALL') as string; // 기본값

      gatheredData.priceInfo = this.priceInfo[sportType] || this.priceInfo.BASEBALL;

    } catch (error) {
      logger.error('Error gathering price inquiry context', { error });
    }

    return gatheredData;
  }

  protected buildPrompt(
    context: ProcessorContext,
    gatheredData: Record<string, unknown>
  ): string {
    const {
      teamName,
      sportType,
      isExistingCustomer,
      hasPreviousOrders,
      requestedQuantity
    } = gatheredData;

    const priceInfo = gatheredData.priceInfo as PriceInfo;

    let prompt = '당신은 Kalron 스포츠 유니폼 전문 상담사입니다.\n\n';

    // 고객 정보
    if (teamName) {
      prompt += '현재 상담 중인 고객:\n';
      prompt += `- 팀명: ${teamName}\n`;
      prompt += `- 종목: ${sportType || '미정'}\n`;
      if (isExistingCustomer) {
        prompt += '- 기존 고객\n';
      }
      if (hasPreviousOrders) {
        prompt += `- 재주문 고객 (${gatheredData.previousOrderCount}회 주문)\n`;
      }
      prompt += '\n';
    }

    // 가격 정보
    prompt += '가격 정보:\n';
    prompt += `- 종목: ${priceInfo.sport}\n`;
    prompt += `- 가격대: ${priceInfo.minPrice.toLocaleString()}${priceInfo.unit} ~ ${priceInfo.maxPrice.toLocaleString()}${priceInfo.unit}\n`;
    prompt += `- 최소 주문 수량: ${priceInfo.minimumQuantity}벌\n`;
    if (priceInfo.additionalInfo) {
      prompt += `- 참고: ${priceInfo.additionalInfo}\n`;
    }
    prompt += '\n';

    // 고객 메시지
    prompt += `고객 문의: "${context.message}"\n\n`;

    // 응답 지침
    prompt += '다음 지침에 따라 응답해주세요:\n';
    prompt += '1. 친절하고 전문적인 톤 유지\n';
    prompt += '2. 가격 정보를 명확하게 전달\n';
    prompt += '3. 가격은 디자인 복잡도, 원단 품질, 추가 옵션에 따라 달라질 수 있음을 안내\n';
    prompt += '4. 정확한 견적을 위해 디자인 상담이 필요함을 부드럽게 유도\n';

    if (isExistingCustomer) {
      prompt += '5. 기존 고객에게는 특별 할인이 가능함을 언급\n';
    }

    if (requestedQuantity && typeof requestedQuantity === 'number' && requestedQuantity < priceInfo.minimumQuantity) {
      prompt += '5. 최소 주문 수량 미달임을 안내하고 대안 제시\n';
    }

    prompt += '\n한국어로 응답하세요. 응답:';

    return prompt;
  }

  protected async postProcess(
    response: string,
    _context: ProcessorContext,
    gatheredData: Record<string, unknown>
  ): Promise<string> {
    const processedResponse = response.trim();

    // 연락처나 추가 액션이 필요한 경우
    if (gatheredData.teamName && !gatheredData.hasPreviousOrders) {
      // 신규 고객인 경우 샘플 신청 안내 추가 고려
    }

    // 메트릭 수집 (나중에 구현)
    await this.collectMetrics(_context, gatheredData);

    return processedResponse;
  }

  /**
   * 이전 주문 내역 조회 (실제로는 OrderService를 통해 조회해야 함)
   */
  private async getPreviousOrders(_customerId: string): Promise<unknown[]> {
    // TODO: OrderService 구현 후 실제 조회로 변경
    return [];
  }

  /**
   * 메트릭 수집
   */
  private async collectMetrics(
    context: ProcessorContext,
    gatheredData: Record<string, unknown>
  ): Promise<void> {
    try {
      // TODO: MetricsService 구현 후 실제 수집
      logger.info('Price inquiry metrics', {
        userId: context.userId,
        sportType: gatheredData.sportType,
        isExistingCustomer: gatheredData.isExistingCustomer,
        hasPreviousOrders: gatheredData.hasPreviousOrders
      });
    } catch (error) {
      logger.error('Error collecting metrics', { error });
    }
  }
}