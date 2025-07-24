import { BaseIntentProcessor } from './base.processor';
import { ProcessorContext, ProcessorResponse } from './base.processor';
import { customerService, paymentService } from '../database';
import logger from '../../utils/logger';

export class OrderRequestProcessor extends BaseIntentProcessor {
  async process(context: ProcessorContext): Promise<ProcessorResponse> {
    return this.baseProcess(context);
  }

  protected async gatherContext(context: ProcessorContext): Promise<Record<string, unknown>> {
    const { userId } = context;

    try {
      // 고객 정보 조회
      const customer = await customerService.findByLineUserId(userId);

      // 주문 통계 조회
      const orderStats = customer ? await paymentService.getOrderStats(customer.id) : null;

      // 최근 주문 정보
      const recentOrders = customer ?
        await paymentService.findByCustomerId(customer.id) : [];

      return {
        customerName: customer?.lineUserName || '고객님',
        teamName: customer?.teamName,
        sportType: customer?.sportType,
        totalOrders: orderStats?.totalOrders || 0,
        completedOrders: orderStats?.completedOrders || 0,
        isNewCustomer: (orderStats?.totalOrders || 0) === 0,
        hasRecentOrder: recentOrders.length > 0
      };
    } catch (error) {
      logger.error('Failed to gather order context', { userId, error });
      return {
        customerName: '고객님',
        isNewCustomer: true
      };
    }
  }

  protected buildPrompt(context: ProcessorContext, gatheredData: Record<string, unknown>): string {
    const { message } = context;
    const {
      customerName,
      teamName,
      sportType,
      totalOrders,
      isNewCustomer
    } = gatheredData;

    let promptContext = '고객이 유니폼 주문을 문의하고 있습니다.\n\n';
    promptContext += '고객 정보:\n';
    promptContext += `- 이름: ${customerName}\n`;

    if (teamName) {
      promptContext += `- 팀명: ${teamName}\n`;
    }

    if (sportType) {
      promptContext += `- 종목: ${sportType}\n`;
    }

    if (isNewCustomer) {
      promptContext += '- 신규 고객 (첫 주문)\n';
    } else {
      promptContext += `- 기존 고객 (총 ${totalOrders}건 주문)\n`;
    }

    promptContext += `\n고객 메시지: "${message}"\n\n`;
    promptContext += '응답 가이드라인:\n';
    promptContext += '1. 주문 의사를 확인하고 환영\n';
    promptContext += '2. 필요한 정보 확인 (팀명, 종목, 수량 등)\n';
    promptContext += '3. 주문서 작성 링크를 안내할 것을 약속\n';
    promptContext += '4. 예상 납기 안내 (일반: 5주, EXPRESS: 4주)\n';
    promptContext += '5. 친절하고 전문적인 톤 유지\n';
    promptContext += '6. 일본어로 응답\n';

    return promptContext;
  }

  protected async postProcess(response: string, _context: ProcessorContext, _gatheredData: Record<string, unknown>): Promise<string> {
    // Customer Journey 업데이트는 ChatbotService에서 중앙 관리
    // 'order.request', 'order.new', 'order.additional' 모두 ORDERSHEET_REQUESTED로 매핑됨

    return response;
  }
}