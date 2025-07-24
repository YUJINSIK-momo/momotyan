// Prisma 클라이언트 및 연결 함수 export
export { prisma, connectDatabase, disconnectDatabase } from './prisma';

// 기본 서비스 클래스 export
export { BaseService } from './base.service';

// 도메인별 서비스 클래스 export
export { CustomerService } from './customer.service';
export { WebhookEventService } from './webhook-event.service';
export { TeamService } from './team.service';
export { ConversationService } from './conversation.service';
export { SlackIntegrationService } from './slack-integration.service';
export { CustomerJourneyService } from './customer-journey.service';
export { CustomerTeamService } from './customer-team.service';
export { DesignService } from './design.service';
export { PaymentService } from './payment.service';
export { DeliveryService } from './delivery.service';
export { OrderTrackingService } from './order-tracking.service';
export { DesignRequestService } from './design-request.service';

// 타입 export
export type { PaginationOptions, PaginatedResult } from './base.service';
export type { ConversationMessage } from './conversation.service';
export type { IntentResponseStrategy } from './intent.service';

import { CustomerService } from './customer.service';
import { WebhookEventService } from './webhook-event.service';
import { TeamService } from './team.service';
import { ConversationService } from './conversation.service';
import { SlackIntegrationService } from './slack-integration.service';
import { intentService } from './intent.service';
import { CustomerJourneyService } from './customer-journey.service';
import { CustomerTeamService } from './customer-team.service';
import { DesignService } from './design.service';
import { PaymentService } from './payment.service';
import { DeliveryService } from './delivery.service';
import { OrderTrackingService } from './order-tracking.service';
import { DesignRequestService } from './design-request.service';

// 서비스 인스턴스 생성 및 export
// 각 서비스는 싱글톤으로 관리됩니다.
export const customerService = new CustomerService();
export const webhookEventService = new WebhookEventService();
export const teamService = new TeamService();
export const conversationService = new ConversationService();
export const slackIntegrationService = new SlackIntegrationService();
export const customerJourneyService = new CustomerJourneyService();
export const customerTeamService = new CustomerTeamService();
export const designService = new DesignService();
export const paymentService = new PaymentService();
export const deliveryService = new DeliveryService();
export const orderTrackingService = new OrderTrackingService();
export const designRequestService = new DesignRequestService();
export { intentService };