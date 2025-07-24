import { SlackIntegrationService } from '../slack-integration.service';
import { prisma } from '../prisma';

// Prisma 모의 객체 설정
// 데이터베이스 호출을 실제로 수행하지 않고 테스트하기 위해 mock 사용
jest.mock('../prisma', () => ({
  prisma: {
    slackIntegration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn()
    }
  }
}));

// 로거 모의 객체 설정
// 실제 로그를 출력하지 않고 호출 여부만 확인
jest.mock('../../../utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };
  return {
    __esModule: true,
    default: mockLogger
  };
});

// SlackIntegrationService 테스트 스위트
// Slack 통합 정보를 관리하는 서비스의 모든 기능을 테스트
describe('SlackIntegrationService', () => {
  let slackIntegrationService: SlackIntegrationService;

  // 각 테스트 전에 실행되는 설정
  // 서비스 인스턴스를 생성하고 모든 mock을 초기화
  beforeEach(() => {
    slackIntegrationService = new SlackIntegrationService();
    jest.clearAllMocks();
  });

  // findByCustomerId 메서드 테스트
  // 고객 ID로 Slack 통합 정보를 찾는 기능 테스트
  describe('findByCustomerId', () => {
    // 고객 ID로 Slack 통합 정보를 찾는 테스트
    it('should find Slack integration by customer ID', async () => {
      // 테스트용 Slack 통합 데이터
      const mockIntegration = {
        id: '1',
        customerId: 'cust123',
        primaryChannel: 'C1111111111',  // Slack 채널 ID
        isActive: true
      };

      (prisma.slackIntegration.findUnique as jest.Mock).mockResolvedValue(mockIntegration);

      const result = await slackIntegrationService.findByCustomerId('cust123');

      // 고객 ID로 검색하는 쿼리가 올바른지 검증
      expect(prisma.slackIntegration.findUnique).toHaveBeenCalledWith({
        where: { customerId: 'cust123' }
      });
      // 결과가 예상한 데이터와 일치하는지 확인
      expect(result).toEqual(mockIntegration);
    });

    // 통합 정보를 찾을 수 없을 때 null을 반환하는 테스트
    it('should return null if integration not found', async () => {
      // 통합 정보가 없는 경우
      (prisma.slackIntegration.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await slackIntegrationService.findByCustomerId('존재하지않는ID');

      // null이 반환되었는지 확인
      expect(result).toBeNull();
    });
  });

  // createOrUpdateByCustomerId 메서드 테스트
  // 고객 ID로 Slack 통합 정보를 생성하거나 업데이트하는 기능 테스트
  describe('createOrUpdateByCustomerId', () => {
    const customerId = 'cust123';

    // 통합 정보가 없을 때 새로 생성하는 테스트
    it('should create new integration if not exists', async () => {
      const mockIntegration = {
        id: '1',
        customerId,
        primaryChannel: 'C1111111111',
        isActive: true
      };

      (prisma.slackIntegration.upsert as jest.Mock).mockResolvedValue(mockIntegration);

      const result = await slackIntegrationService.createOrUpdateByCustomerId(customerId, {
        primaryChannel: 'C1111111111'
      });

      // upsert 호출이 올바른 파라미터로 이루어졌는지 검증
      // create: 새로운 레코드 생성 시 사용
      // update: 기존 레코드 업데이트 시 사용
      expect(prisma.slackIntegration.upsert).toHaveBeenCalledWith({
        where: { customerId },
        create: {
          customerId,
          isActive: true,
          primaryChannel: 'C1111111111'
        },
        update: {
          primaryChannel: 'C1111111111'
        }
      });
      expect(result).toEqual(mockIntegration);
    });

    // 기존 통합 정보를 업데이트하는 테스트
    it('should update existing integration', async () => {
      const mockIntegration = {
        id: '1',
        customerId,
        primaryChannel: 'C2222222222',  // 새로운 채널 ID
        threadTs: '1234567890.123456',  // Slack 스레드 타임스탬프
        isActive: true
      };

      (prisma.slackIntegration.upsert as jest.Mock).mockResolvedValue(mockIntegration);

      const result = await slackIntegrationService.createOrUpdateByCustomerId(customerId, {
        primaryChannel: 'C2222222222',
        threadTs: '1234567890.123456'
      });

      expect(result).toEqual(mockIntegration);
    });

    // upsert 오류 처리 테스트
    // 데이터베이스 오류 발생 시 적절하게 처리되는지 확인
    it('should handle upsert errors', async () => {
      const error = new Error('데이터베이스 오류');
      (prisma.slackIntegration.upsert as jest.Mock).mockRejectedValue(error);

      // 오류가 적절히 전파되는지 검증
      await expect(
        slackIntegrationService.createOrUpdateByCustomerId(customerId, {
          primaryChannel: 'C1111111111'
        })
      ).rejects.toThrow('데이터베이스 오류');
    });
  });

  // updatePrimaryChannel 메서드 테스트
  // 주 채널을 업데이트하는 기능 테스트
  describe('updatePrimaryChannel', () => {
    // 주 채널을 업데이트하는 테스트
    it('should update primary channel', async () => {
      const mockIntegration = {
        id: '1',
        customerId: 'cust123',
        primaryChannel: 'C3333333333',
        isActive: true
      };

      (prisma.slackIntegration.upsert as jest.Mock).mockResolvedValue(mockIntegration);

      const result = await slackIntegrationService.updatePrimaryChannel('cust123', 'C3333333333');

      // 주 채널 업데이트가 올바른 파라미터로 호출되었는지 검증
      expect(prisma.slackIntegration.upsert).toHaveBeenCalledWith({
        where: { customerId: 'cust123' },
        create: {
          customerId: 'cust123',
          isActive: true,
          primaryChannel: 'C3333333333'
        },
        update: {
          primaryChannel: 'C3333333333'
        }
      });
      // 결과의 주 채널이 업데이트되었는지 확인
      expect(result.primaryChannel).toBe('C3333333333');
    });
  });

  // updateCurrentThread 메서드 테스트
  // 현재 스레드 타임스탬프를 업데이트하는 기능 테스트
  describe('updateCurrentThread', () => {
    // 현재 스레드 타임스탬프를 업데이트하는 테스트
    it('should update current thread timestamp', async () => {
      const mockIntegration = {
        id: '1',
        customerId: 'cust123',
        threadTs: '1234567890.123456',  // Slack 스레드 타임스탬프
        isActive: true
      };

      (prisma.slackIntegration.upsert as jest.Mock).mockResolvedValue(mockIntegration);

      const result = await slackIntegrationService.updateCurrentThread('cust123', '1234567890.123456');

      // 스레드 타임스탬프 업데이트가 올바른 파라미터로 호출되었는지 검증
      expect(prisma.slackIntegration.upsert).toHaveBeenCalledWith({
        where: { customerId: 'cust123' },
        create: {
          customerId: 'cust123',
          isActive: true,
          threadTs: '1234567890.123456'
        },
        update: {
          threadTs: '1234567890.123456'
        }
      });
      // 결과의 스레드 타임스탬프가 업데이트되었는지 확인
      expect(result.threadTs).toBe('1234567890.123456');
    });
  });

  // deactivate 메서드 테스트
  // 통합을 비활성화하고 스레드 정보를 초기화하는 기능 테스트
  describe('deactivate', () => {
    // 통합을 비활성화하고 스레드를 초기화하는 테스트
    it('should deactivate integration and clear thread', async () => {
      // 비활성화된 통합 데이터
      const mockIntegration = {
        id: '1',
        customerId: 'cust123',
        isActive: false,  // 비활성 상태
        threadTs: null    // 스레드 정보 초기화
      };

      (prisma.slackIntegration.update as jest.Mock).mockResolvedValue(mockIntegration);

      const result = await slackIntegrationService.deactivate('cust123');

      // 비활성화 업데이트가 올바른 파라미터로 호출되었는지 검증
      expect(prisma.slackIntegration.update).toHaveBeenCalledWith({
        where: { customerId: 'cust123' },
        data: {
          isActive: false,
          threadTs: null
        }
      });
      // 결과가 비활성 상태이고 스레드 정보가 초기화되었는지 확인
      expect(result.isActive).toBe(false);
      expect(result.threadTs).toBeNull();
    });
  });

  // findActiveByChannel 메서드 테스트
  // 특정 채널의 모든 활성 통합을 찾는 기능 테스트
  describe('findActiveByChannel', () => {
    // 채널별 모든 활성 통합을 찾는 테스트
    it('should find all active integrations by channel', async () => {
      // 동일한 채널에 속한 여러 통합 데이터
      const mockIntegrations = [
        {
          id: '1',
          customerId: 'cust123',
          primaryChannel: 'C1111111111',
          isActive: true
        },
        {
          id: '2',
          customerId: 'cust456',
          primaryChannel: 'C1111111111',
          isActive: true
        }
      ];

      (prisma.slackIntegration.findMany as jest.Mock).mockResolvedValue(mockIntegrations);

      const result = await slackIntegrationService.findActiveByChannel('C1111111111');

      // 채널별 활성 통합 검색 쿼리가 올바른지 검증
      expect(prisma.slackIntegration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            primaryChannel: 'C1111111111',
            isActive: true
          }
        })
      );
      // 2개의 통합이 반환되었는지 확인
      expect(result).toHaveLength(2);
      expect(result).toEqual(mockIntegrations);
    });

    // 활성 통합이 없을 때 빈 배열을 반환하는 테스트
    it('should return empty array if no active integrations', async () => {
      // 해당 채널에 활성 통합이 없는 경우
      (prisma.slackIntegration.findMany as jest.Mock).mockResolvedValue([]);

      const result = await slackIntegrationService.findActiveByChannel('C9999999999');

      // 빈 배열이 반환되었는지 확인
      expect(result).toEqual([]);
    });
  });

  // getChannelStats 메서드 테스트
  // 채널별 통계를 반환하는 기능 테스트
  describe('getChannelStats', () => {
    // 채널 통계를 반환하는 테스트
    it('should return channel statistics', async () => {
      // 채널별 통합 개수 데이터
      const mockStats = [
        {
          primaryChannel: 'C1111111111',
          _count: { _all: 5 }  // 이 채널에 5개의 통합
        },
        {
          primaryChannel: 'C2222222222',
          _count: { _all: 3 }  // 이 채널에 3개의 통합
        }
      ];

      (prisma.slackIntegration.groupBy as jest.Mock).mockResolvedValue(mockStats);

      const result = await slackIntegrationService.getChannelStats();

      // groupBy 쿼리가 올바른 파라미터로 호출되었는지 검증
      expect(prisma.slackIntegration.groupBy).toHaveBeenCalledWith({
        by: ['primaryChannel'],
        _count: {
          _all: true
        },
        where: {
          isActive: true,
          primaryChannel: { not: null }
        }
      });
      // 결과가 예상한 형식으로 변환되었는지 확인
      // 채널 ID를 키로, 통합 개수를 값으로 하는 객체
      expect(result).toEqual({
        'C1111111111': 5,
        'C2222222222': 3
      });
    });

    // groupBy 오류 처리 테스트
    // 데이터베이스 오류 발생 시 적절하게 처리되는지 확인
    it('should handle groupBy errors', async () => {
      const error = new Error('데이터베이스 오류');
      (prisma.slackIntegration.groupBy as jest.Mock).mockRejectedValue(error);

      // 오류가 적절히 전파되는지 검증
      await expect(slackIntegrationService.getChannelStats()).rejects.toThrow('데이터베이스 오류');
    });

    // 비어있는 통계를 처리하는 테스트
    // 통합 데이터가 없을 때 빈 객체를 반환하는지 확인
    it('should handle empty stats', async () => {
      // 통계 데이터가 없는 경우
      (prisma.slackIntegration.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await slackIntegrationService.getChannelStats();

      // 빈 객체가 반환되었는지 확인
      expect(result).toEqual({});
    });
  });
});