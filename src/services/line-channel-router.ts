import { config } from '../config';
import { SportType, Brand } from '../generated/prisma';
import logger from '../utils/logger';

// LINE 채널 정보 인터페이스
// 각 브랜드별 채널의 설정 정보를 정의
export interface LineChannelInfo {
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  brand: Brand;                // 브랜드는 필수 (ILB_MAX 또는 MAX2MAX)
  sportType: SportType | null; // ILB_MAX: BASEBALL 고정, MAX2MAX: null (대화 중 결정)
  name: string;
}

// SportType 정책:
// - BASEBALL: ILB_MAX 채널에서만 사용
// - null: MAX2MAX 채널 (SOCCER/BASKETBALL은 대화 중 고객이 팀 정보 제공 시 결정)

// LINE 채널 라우터 클래스
// 여러 LINE 채널을 관리하고 브랜드별로 라우팅하는 기능을 제공
export class LineChannelRouter {
  private channelMap: Map<string, LineChannelInfo> = new Map();
  private secretMap: Map<string, LineChannelInfo> = new Map();

  constructor() {
    this.initializeChannels();
  }

  // 채널 초기화 메서드
  // 환경 설정에서 각 브랜드별 채널 정보를 읽어와서 라우터에 등록
  private initializeChannels(): void {
    // 기본 채널은 더 이상 지원하지 않음
    // 모든 채널은 명확한 브랜드를 가져야 함
    if (config.line.channelId && config.line.channelSecret) {
      logger.warn('Default channel configuration detected but not supported. Please use brand-specific channels.');
    }

    // ILB-MAX 채널 추가
    // 야구 전문 브랜드 채널을 등록
    const ilbMaxChannel = config.line.channels.ilbMax;
    if (ilbMaxChannel.channelId && ilbMaxChannel.channelSecret) {
      const channelInfo: LineChannelInfo = {
        channelId: ilbMaxChannel.channelId,
        channelSecret: ilbMaxChannel.channelSecret,
        channelAccessToken: ilbMaxChannel.channelAccessToken,
        brand: Brand.ILB_MAX,
        sportType: SportType.BASEBALL,
        name: 'ilbMax'
      };
      this.channelMap.set(channelInfo.channelId, channelInfo);
      this.secretMap.set(channelInfo.channelSecret, channelInfo);
    }

    // MAX2MAX 채널 추가
    // 축구/농구 브랜드 채널을 등록 (스포츠 타입은 대화 중 결정)
    const max2maxChannel = config.line.channels.max2max;
    if (max2maxChannel.channelId && max2maxChannel.channelSecret) {
      const channelInfo: LineChannelInfo = {
        channelId: max2maxChannel.channelId,
        channelSecret: max2maxChannel.channelSecret,
        channelAccessToken: max2maxChannel.channelAccessToken,
        brand: Brand.MAX2MAX,
        sportType: null, // 대화 중 결정
        name: 'max2max'
      };
      this.channelMap.set(channelInfo.channelId, channelInfo);
      this.secretMap.set(channelInfo.channelSecret, channelInfo);
    }

    logger.info('LINE channel router initialized', {
      channels: Array.from(this.channelMap.keys()),
      channelNames: Array.from(this.channelMap.values()).map(ch => ch.name)
    });
  }

  /**
   * 채널 ID로 채널 정보 조회
   * @param channelId LINE 채널 ID
   * @returns 채널 정보 또는 null
   */
  public getChannelById(channelId: string): LineChannelInfo | null {
    return this.channelMap.get(channelId) || null;
  }

  /**
   * 채널 시크릿으로 채널 정보 조회 (웹훅 검증용)
   * @param channelSecret LINE 채널 시크릿
   * @returns 채널 정보 또는 null
   */
  public getChannelBySecret(channelSecret: string): LineChannelInfo | null {
    return this.secretMap.get(channelSecret) || null;
  }

  /**
   * 웹훅 헤더에서 채널 정보 추출
   * @param headers 웹훅 요청 헤더
   * @returns 채널 정보 또는 null
   */
  public getChannelFromHeaders(headers: Record<string, string | string[] | undefined>): LineChannelInfo | null {
    // LINE에서 커스텀 헤더로 채널 ID를 전송
    const channelId = headers['x-line-channel-id'] as string;
    if (channelId) {
      return this.getChannelById(channelId);
    }

    // 기본 채널로 폴백
    return this.getChannelById(config.line.channelId);
  }

  /**
   * 등록된 모든 채널 정보 조회
   * @returns 모든 채널 정보 배열
   */
  public getAllChannels(): LineChannelInfo[] {
    return Array.from(this.channelMap.values());
  }

  /**
   * LINE 채널 기반 Slack 라우팅 컨텍스트 생성
   * @param channelInfo LINE 채널 정보
   * @returns Slack 라우팅을 위한 브랜드 및 스포츠 타입 정보
   */
  public getSlackRoutingContext(channelInfo: LineChannelInfo): {
    brand: Brand;
    sportType: SportType | undefined;
  } {
    return {
      brand: channelInfo.brand,
      sportType: channelInfo.sportType || undefined
    };
  }
}

// 싱글톤 인스턴스
let channelRouter: LineChannelRouter | null = null;

/**
 * LINE 채널 라우터 싱글톤 인스턴스 반환
 * @returns LineChannelRouter 인스턴스
 */
export function getLineChannelRouter(): LineChannelRouter {
  if (!channelRouter) {
    channelRouter = new LineChannelRouter();
  }
  return channelRouter;
}