import { CustomerJourneyService } from '../customer-journey.service';
import { prisma } from '../prisma';
import { CustomerJourneyStage, ProgressStatus } from '../../../generated/prisma';

// Prisma 모의 객체 설정
// 데이터베이스 호출을 실제로 수행하지 않고 테스트하기 위해 mock 사용
jest.mock('../prisma', () => ({
  prisma: {
    customerJourney: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn()
    }
  }
}));
jest.mock('../../../utils/logger');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// CustomerJourneyService 테스트 스위트
// 고객 여정의 각 단계를 추적하고 관리하는 서비스의 모든 기능을 테스트
describe('CustomerJourneyService', () => {
  let service: CustomerJourneyService;

  // 각 테스트 전에 실행되는 설정
  // 모든 mock 함수를 초기화하고 서비스 인스턴스를 새로 생성
  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerJourneyService();
  });

  // updateJourneyStage 메서드 테스트
  // 고객 여정의 단계를 업데이트하는 핵심 기능 테스트
  describe('updateJourneyStage', () => {
    // 신규 고객의 첫 여정 생성 테스트
    // 고객이 처음으로 서비스를 이용할 때 새로운 여정 레코드가 생성되는지 확인
    it('should create new journey for first-time customer', async () => {
      const customerId = 'customer-1';
      const stage = CustomerJourneyStage.FIRST_MESSAGE;
      // 테스트에 사용할 모의 여정 데이터
      const mockJourney = {
        id: 'journey-1',
        customerId,
        progressStatus: ProgressStatus.IN_PROGRESS,
        journeyStage: stage,
        trackingCount: 1,
        friendAddedTime: new Date(),
        firstMessageTime: new Date(),
        designRequestTime: null,
        designConfirmTime: null,
        ordersheetTime: null,
        paymentCompleteTime: null,
        timeToFirstDesign: null,
        timeToOrdersheet: null,
        timeToPayment: null,
        firstDesignSentDate: null,
        designConfirmDate: null,
        ordersheetSentDate: null,
        ordersheetCompleteDate: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 기존 여정이 없다고 가정 (null 반환)
      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(null);
      // 새 여정 생성 시 mockJourney 반환
      (mockPrisma.customerJourney.create as jest.Mock).mockResolvedValue(mockJourney);

      const result = await service.updateJourneyStage(customerId, stage);

      // 진행 중인 여정이 있는지 먼저 확인했는지 검증
      expect(mockPrisma.customerJourney.findFirst).toHaveBeenCalledWith({
        where: {
          customerId,
          progressStatus: ProgressStatus.IN_PROGRESS
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      // 새로운 여정이 올바른 데이터로 생성되었는지 검증
      expect(mockPrisma.customerJourney.create).toHaveBeenCalledWith({
        data: {
          customer: { connect: { id: customerId } },
          progressStatus: ProgressStatus.IN_PROGRESS,
          journeyStage: stage
        }
      });
      // 반환된 결과가 설정한 stage와 일치하는지 확인
      expect(result.journeyStage).toBe(stage);
    });

    // 기존 여정의 단계 업데이트 테스트
    // 이미 진행 중인 고객 여정이 있을 때 새로운 단계로 업데이트되는지 확인
    it('should update existing journey with new stage', async () => {
      const customerId = 'customer-1';
      const stage = CustomerJourneyStage.DESIGN_CONFIRMED;
      // 기존 여정 데이터 - 디자인 요청 단계에서 디자인 확정 단계로 이동
      const existingJourney = {
        id: 'journey-1',
        customerId,
        progressStatus: ProgressStatus.IN_PROGRESS,
        journeyStage: CustomerJourneyStage.DESIGN_REQUESTING,
        trackingCount: 3,
        friendAddedTime: new Date('2024-01-01'),
        firstMessageTime: new Date('2024-01-01'),
        designRequestTime: new Date('2024-01-02'),
        designConfirmTime: null,
        ordersheetTime: null,
        paymentCompleteTime: null,
        timeToFirstDesign: 1,
        timeToOrdersheet: null,
        timeToPayment: null,
        firstDesignSentDate: null,
        designConfirmDate: null,
        ordersheetSentDate: null,
        ordersheetCompleteDate: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      };

      // 기존 여정이 있다고 가정
      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(existingJourney);
      // 여정 업데이트 시 디자인 확정 시간과 추적 카운트도 함께 업데이트
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...existingJourney,
        journeyStage: stage,
        designConfirmTime: new Date(),
        trackingCount: 4,
        updatedAt: new Date()
      });

      const result = await service.updateJourneyStage(customerId, stage);

      // 기존 여정 검색이 올바르게 수행되었는지 검증
      expect(mockPrisma.customerJourney.findFirst).toHaveBeenCalledWith({
        where: {
          customerId,
          progressStatus: ProgressStatus.IN_PROGRESS
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      // 여정 단계가 올바르게 업데이트되었는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: { journeyStage: stage }
      });
      expect(result.journeyStage).toBe(stage);
    });

    // 결제 완료 단계 처리 테스트
    // 결제가 완료되었을 때 여정 상태가 올바르게 업데이트되는지 확인
    it('should handle payment completion stage', async () => {
      const customerId = 'customer-1';
      const stage = CustomerJourneyStage.PAYMENT_COMPLETED;
      // 주문서 작성 완료 단계에서 결제 완료 단계로 이동
      const existingJourney = {
        id: 'journey-1',
        customerId,
        progressStatus: ProgressStatus.IN_PROGRESS,
        journeyStage: CustomerJourneyStage.ORDERSHEET_COMPLETED,
        friendAddedTime: new Date('2024-01-01'),
        firstMessageTime: new Date('2024-01-01'),
        designRequestTime: new Date('2024-01-02'),
        designConfirmTime: new Date('2024-01-03'),
        ordersheetTime: new Date('2024-01-04'),
        paymentCompleteTime: null,
        timeToFirstDesign: 1,
        timeToOrdersheet: 3,
        timeToPayment: null
      };

      // 기존 여정 데이터 설정
      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(existingJourney);
      // 결제 완료 시간과 결제까지 소요된 시간이 함께 업데이트
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...existingJourney,
        journeyStage: stage,
        paymentCompleteTime: new Date(),
        timeToPayment: 4
      });

      const result = await service.updateJourneyStage(customerId, stage);

      // 결제 완료 단계로 올바르게 업데이트되었는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: { journeyStage: stage }
      });
      expect(result.journeyStage).toBe(stage);
    });
  });

  // completeJourney 메서드 테스트
  // 고객 여정을 완료 상태로 변경하는 기능 테스트
  describe('completeJourney', () => {
    // 활성 여정 완료 처리 테스트
    // 진행 중인 고객 여정을 완료 상태로 변경하는 기능 검증
    it('should complete an active journey', async () => {
      // 완료할 여정 데이터 - 결제 완료 단계에서 진행 중
      const mockJourney = {
        id: 'journey-1',
        customerId: 'customer-1',
        progressStatus: ProgressStatus.IN_PROGRESS,
        journeyStage: CustomerJourneyStage.PAYMENT_COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(mockJourney);
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...mockJourney,
        progressStatus: ProgressStatus.COMPLETED
      });

      const result = await service.completeJourney('customer-1');

      // 결과가 완료 상태로 변경되었는지 검증
      expect(result).toEqual({
        ...mockJourney,
        progressStatus: ProgressStatus.COMPLETED
      });
      // 업데이트 호출이 올바른 파라미터로 이루어졌는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: { progressStatus: ProgressStatus.COMPLETED }
      });
    });

    // 활성 여정이 없을 때의 처리 테스트
    // 완료할 여정이 없으면 null을 반환하고 업데이트하지 않는지 확인
    it('should return null if no active journey', async () => {
      // 진행 중인 여정이 없다고 가정
      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.completeJourney('customer-1');

      // null이 반환되고 업데이트가 호출되지 않았는지 검증
      expect(result).toBeNull();
      expect(mockPrisma.customerJourney.update).not.toHaveBeenCalled();
    });
  });

  // dropJourney 메서드 테스트
  // 고객이 여정을 중도에 포기했을 때의 처리 테스트
  describe('dropJourney', () => {
    // 활성 여정 중단 처리 테스트
    // 고객이 여정을 중도에 포기했을 때의 상태 변경 검증
    it('should drop an active journey', async () => {
      // 중단할 여정 데이터 - 디자인 요청 단계에서 진행 중
      const mockJourney = {
        id: 'journey-1',
        customerId: 'customer-1',
        progressStatus: ProgressStatus.IN_PROGRESS,
        journeyStage: CustomerJourneyStage.DESIGN_REQUESTING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(mockJourney);
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...mockJourney,
        progressStatus: ProgressStatus.DROPPED
      });

      const result = await service.dropJourney('customer-1');

      // 결과가 중단 상태로 변경되었는지 검증
      expect(result).toEqual({
        ...mockJourney,
        progressStatus: ProgressStatus.DROPPED
      });
      // 업데이트 호출이 올바른 파라미터로 이루어졌는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: { progressStatus: ProgressStatus.DROPPED }
      });
    });

    // 중단할 활성 여정이 없을 때의 처리 테스트
    // 중단할 여정이 없으면 null을 반환하고 업데이트하지 않는지 확인
    it('should return null if no active journey', async () => {
      // 진행 중인 여정이 없다고 가정
      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.dropJourney('customer-1');

      // null이 반환되고 업데이트가 호출되지 않았는지 검증
      expect(result).toBeNull();
      expect(mockPrisma.customerJourney.update).not.toHaveBeenCalled();
    });
  });

  // incrementTrackingCount 메서드 테스트
  // 고객 여정의 추적 횟수를 증가시키는 기능 테스트
  describe('incrementTrackingCount', () => {
    // 추적 횟수 증가 기능 테스트
    // 고객 여정에서 특정 액션이 발생할 때마다 카운트를 증가시키는 기능 검증
    it('should increment tracking count for active journey', async () => {
      // 추적 횟수를 증가시킬 여정 데이터
      const mockJourney = {
        id: 'journey-1',
        customerId: 'customer-1',
        trackingCount: 5,  // 현재 추적 횟수: 5
        progressStatus: ProgressStatus.IN_PROGRESS
      };

      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(mockJourney);
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...mockJourney,
        trackingCount: 6
      });

      const result = await service.incrementTrackingCount('customer-1');

      // 추적 횟수가 1씩 증가하도록 호출되었는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: { trackingCount: { increment: 1 } }
      });
      // 결과가 5에서 6으로 증가했는지 확인
      expect(result?.trackingCount).toBe(6);
    });

    // 활성 여정이 없을 때 추적 횟수 증가 시도 테스트
    // 증가시킬 여정이 없으면 null을 반환하고 업데이트하지 않는지 확인
    it('should return null if no active journey', async () => {
      // 진행 중인 여정이 없다고 가정
      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.incrementTrackingCount('customer-1');

      // null이 반환되고 업데이트가 호출되지 않았는지 검증
      expect(result).toBeNull();
      expect(mockPrisma.customerJourney.update).not.toHaveBeenCalled();
    });
  });

  // updateTimeMetrics 메서드 테스트
  // 각 단계별 소요 시간을 기록하는 기능 테스트
  describe('updateTimeMetrics', () => {
    // 시간 지표 업데이트 기능 테스트
    // 각 단계별 소요 시간을 기록하는 기능이 올바르게 작동하는지 검증
    it('should update time metrics', async () => {
      // 업데이트할 여정 데이터
      const mockJourney = {
        id: 'journey-1',
        customerId: 'customer-1',
        progressStatus: ProgressStatus.IN_PROGRESS
      };

      // 업데이트할 시간 지표 (분 단위)
      // timeToFirstDesign: 첫 디자인까지 소요 시간 (120분)
      // timeToOrdersheet: 주문서까지 소요 시간 (240분)
      const metrics = {
        timeToFirstDesign: 120,
        timeToOrdersheet: 240
      };

      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(mockJourney);
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...mockJourney,
        ...metrics
      });

      const result = await service.updateTimeMetrics('customer-1', metrics);

      // 시간 지표가 올바르게 업데이트되었는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: metrics
      });
      // 반환된 결과가 업데이트한 지표와 일치하는지 확인
      expect(result).toMatchObject(metrics);
    });
  });

  // updateKeyDates 메서드 테스트
  // 주요 날짜 정보를 업데이트하는 기능 테스트
  describe('updateKeyDates', () => {
    // 주요 날짜 정보 업데이트 기능 테스트
    // 디자인 전송일, 확정일 등 중요한 날짜 정보를 기록하는 기능 검증
    it('should update key dates', async () => {
      // 업데이트할 여정 데이터
      const mockJourney = {
        id: 'journey-1',
        customerId: 'customer-1',
        progressStatus: ProgressStatus.IN_PROGRESS
      };

      // 업데이트할 주요 날짜 정보
      // firstDesignSentDate: 첫 번째 디자인 전송일
      // designConfirmDate: 디자인 확정일
      const dates = {
        firstDesignSentDate: new Date(),
        designConfirmDate: new Date()
      };

      (mockPrisma.customerJourney.findFirst as jest.Mock).mockResolvedValue(mockJourney);
      (mockPrisma.customerJourney.update as jest.Mock).mockResolvedValue({
        ...mockJourney,
        ...dates
      });

      const result = await service.updateKeyDates('customer-1', dates);

      // 날짜 정보가 올바르게 업데이트되었는지 검증
      expect(mockPrisma.customerJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: dates
      });
      // 반환된 결과가 업데이트한 날짜 정보와 일치하는지 확인
      expect(result).toMatchObject(dates);
    });
  });
});