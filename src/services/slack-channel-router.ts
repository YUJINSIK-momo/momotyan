import { SportType, IntentCategory } from '../generated/prisma';
import logger from '../utils/logger';

// 채널 라우팅 컨텍스트 인터페이스
// Slack 채널 결정에 사용되는 다양한 컨텍스트 정보를 정의
export interface ChannelRoutingContext {
  sportType?: SportType;
  brand?: string;
  intentCategory?: IntentCategory;
  isDesignRelated?: boolean;
  isPaymentRelated?: boolean;
  isSampleRequest?: boolean;
  isClaim?: boolean;
  lineChannelName?: string; // LINE 채널 식별자
}

// Slack 채널 라우터 클래스
// 인텐트, 스포츠 타입, 브랜드 등을 기반으로 적절한 Slack 채널을 결정
export class SlackChannelRouter {
  private readonly channelMapping: Record<string, string>;

  constructor(channelConfig: Record<string, string>) {
    this.channelMapping = channelConfig;
  }

  /**
   * 컨텍스트를 기반으로 적절한 Slack 채널 결정
   * @param context 채널 라우팅 컨텍스트
   * @returns Slack 채널 ID
   */
  public getChannel(context: ChannelRoutingContext): string {
    // 우선순위 1: 인텐트 기반 특수 목적 채널
    if (context.isClaim || context.intentCategory === IntentCategory.CLAIM) {
      return this.channelMapping.claim || this.channelMapping.default;
    }

    if (context.isDesignRelated || context.intentCategory === IntentCategory.DESIGN_INQUIRY) {
      return this.channelMapping.design || this.channelMapping.default;
    }

    if (context.isSampleRequest || context.intentCategory === IntentCategory.SAMPLE_REQUEST) {
      return this.channelMapping.sample || this.channelMapping.default;
    }

    if (context.isPaymentRelated || context.intentCategory === IntentCategory.PAYMENT_DELIVERY) {
      return this.channelMapping.payment || this.channelMapping.default;
    }

    // 우선순위 2: 스포츠 종목별 채널
    if (context.sportType) {
      const sportChannel = this.getSportChannel(context.sportType);
      if (sportChannel) {
        return sportChannel;
      }
    }

    // 우선순위 3: 브랜드 기반 라우팅
    if (context.brand) {
      const brandChannel = this.getBrandChannel(context.brand);
      if (brandChannel) {
        return brandChannel;
      }
    }

    // 기본 채널
    return this.channelMapping.default;
  }

  /**
   * 표시용 채널 이름 조회
   * @param channelId Slack 채널 ID
   * @returns 표시용 채널 이름
   */
  public getChannelName(channelId: string): string {
    // 역방향 조회로 채널 이름 찾기
    for (const [name, id] of Object.entries(this.channelMapping)) {
      if (id === channelId) {
        return this.getDisplayName(name);
      }
    }
    return '알 수 없는 채널';
  }

  /**
   * 필수 채널이 모두 설정되었는지 검증
   * @returns 설정이 유효한지 여부
   */
  public validateConfiguration(): boolean {
    const requiredChannels = ['default'];
    const missingChannels = requiredChannels.filter(
      channel => !this.channelMapping[channel]
    );

    if (missingChannels.length > 0) {
      logger.error('필수 Slack 채널이 누락됨', { missingChannels });
      return false;
    }

    // 사용 가능한 채널 로깅
    const availableChannels = Object.keys(this.channelMapping).filter(
      key => this.channelMapping[key]
    );
    logger.info('Slack 채널 라우터 초기화 완료', { availableChannels });

    return true;
  }

  // 스포츠 타입별 채널 매핑
  // 각 스포츠 종목에 해당하는 Slack 채널을 반환
  private getSportChannel(sportType: SportType): string | null {
    switch (sportType) {
    case SportType.BASEBALL:
      return this.channelMapping.baseball || null;
    case SportType.SOCCER:
      return this.channelMapping.soccer || null;
    case SportType.BASKETBALL:
      return this.channelMapping.basketball || null;
    default:
      return null;
    }
  }

  // 브랜드별 채널 매핑
  // 브랜드 정보를 바탕으로 적절한 채널을 결정
  private getBrandChannel(brand: string): string | null {
    // ILB-MAX → 야구 채널
    if (brand === 'ILB_MAX' || brand === 'ILB-MAX') {
      return this.channelMapping.baseball || null;
    }

    // MAX2MAX → 축구 또는 농구일 수 있으므로 스포츠 타입 필요
    if (brand === 'MAX2MAX') {
      // 브랜드만으로는 축구/농구를 구분할 수 없으므로 null 반환하여
      // 기본 채널로 폴백되도록 함
      return null;
    }

    return null;
  }

  // 채널 키를 표시용 이름으로 변환
  // Slack 채널의 실제 표시 이름을 반환
  private getDisplayName(channelKey: string): string {
    const displayNames: Record<string, string> = {
      baseball: '#아구ILB-MAX',
      soccer: '#축구MAX2MAX',
      basketball: '#농구MAX2MAX',
      design: '#디자인',
      claim: '#클레임',
      sample: '#샘플',
      payment: '#결제알림',
      default: '#전체공지'
    };

    return displayNames[channelKey] || channelKey;
  }

  /**
   * 인텐트 분석을 기반으로 채널 추천
   * @param intentName 인텐트 이름
   * @param parameters 인텐트 매개변수
   * @returns 채널 라우팅 컨텍스트
   */
  public analyzeIntent(intentName: string, parameters?: Record<string, unknown>): Partial<ChannelRoutingContext> {
    const context: Partial<ChannelRoutingContext> = {};

    // 디자인 관련 인텐트
    if (intentName.includes('design') || intentName.includes('디자인')) {
      context.isDesignRelated = true;
      context.intentCategory = IntentCategory.DESIGN_INQUIRY;
    }

    // 클레임 관련 인텐트
    if (intentName.includes('claim') || intentName.includes('클레임') ||
        intentName.includes('complaint') || intentName.includes('불만')) {
      context.isClaim = true;
      context.intentCategory = IntentCategory.CLAIM;
    }

    // 샘플 관련 인텐트
    if (intentName.includes('sample') || intentName.includes('샘플')) {
      context.isSampleRequest = true;
      context.intentCategory = IntentCategory.SAMPLE_REQUEST;
    }

    // 결제 관련 인텐트
    if (intentName.includes('payment') || intentName.includes('결제') ||
        intentName.includes('delivery') || intentName.includes('배송')) {
      context.isPaymentRelated = true;
      context.intentCategory = IntentCategory.PAYMENT_DELIVERY;
    }

    // 매개변수에서 스포츠 타입 추출 (가능한 경우)
    if (parameters?.sport) {
      const sportMap: Record<string, SportType> = {
        '야구': SportType.BASEBALL,
        'baseball': SportType.BASEBALL,
        '축구': SportType.SOCCER,
        'soccer': SportType.SOCCER,
        'football': SportType.SOCCER,
        '농구': SportType.BASKETBALL,
        'basketball': SportType.BASKETBALL
      };

      const sportValue = String(parameters.sport).toLowerCase();
      if (sportMap[sportValue]) {
        context.sportType = sportMap[sportValue];
      }
    }

    return context;
  }
}

// 싱글톤 인스턴스
let channelRouter: SlackChannelRouter | null = null;

/**
 * 채널 라우터 초기화
 * @param channelConfig 채널 설정 매핑
 * @returns SlackChannelRouter 인스턴스
 */
export function initializeChannelRouter(channelConfig: Record<string, string>): SlackChannelRouter {
  channelRouter = new SlackChannelRouter(channelConfig);
  channelRouter.validateConfiguration();
  return channelRouter;
}

/**
 * 채널 라우터 싱글톤 인스턴스 반환
 * @returns SlackChannelRouter 인스턴스
 * @throws 초기화되지 않은 경우 에러 발생
 */
export function getChannelRouter(): SlackChannelRouter {
  if (!channelRouter) {
    throw new Error('SlackChannelRouter not initialized. Call initializeChannelRouter first.');
  }
  return channelRouter;
}