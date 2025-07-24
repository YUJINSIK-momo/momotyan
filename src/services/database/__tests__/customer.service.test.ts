import { CustomerService } from '../customer.service';
import { prisma } from '../prisma';
import { SportType, Brand } from '../../../generated/prisma';

// Prisma 모의 객체 설정
// 데이터베이스 호출을 실제로 수행하지 않고 테스트하기 위해 mock 사용
jest.mock('../prisma', () => ({
  prisma: {
    customer: {
      update: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn()
    }
  }
}));

// CustomerService 테스트 스위트
// 고객 정보를 관리하는 서비스의 모든 기능을 테스트
describe('CustomerService', () => {
  let customerService: CustomerService;

  // 각 테스트 전에 실행되는 설정
  // 서비스 인스턴스를 생성하고 모든 mock을 초기화
  beforeEach(() => {
    customerService = new CustomerService();
    jest.clearAllMocks();
  });

  // updateSportAndBrand 메서드 테스트
  // 고객의 스포츠 종목과 브랜드를 업데이트하는 기능 테스트
  describe('updateSportAndBrand', () => {
    const mockLineUserId = 'U123456789';

    // 야구 종목에 대한 스포츠 타입과 브랜드 업데이트 테스트
    // 야구는 ILB_MAX 브랜드로 자동 설정됨
    it('should update sport type and brand for baseball', async () => {
      const mockCustomer = {
        id: '1',
        lineUserId: mockLineUserId,
        sportType: SportType.BASEBALL,
        brand: Brand.ILB_MAX
      };

      (prisma.customer.update as jest.Mock).mockResolvedValue(mockCustomer);

      const result = await customerService.updateSportAndBrand(
        mockLineUserId,
        SportType.BASEBALL
      );

      // 야구 종목과 ILB_MAX 브랜드로 업데이트되었는지 검증
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { lineUserId: mockLineUserId },
        data: {
          sportType: SportType.BASEBALL,
          brand: 'ILB_MAX'
        }
      });
      expect(result).toEqual(mockCustomer);
    });

    // 축구 종목에 대한 스포츠 타입과 브랜드 업데이트 테스트
    // 축구는 MAX2MAX 브랜드로 자동 설정됨
    it('should update sport type and brand for soccer', async () => {
      const mockCustomer = {
        id: '1',
        lineUserId: mockLineUserId,
        sportType: SportType.SOCCER,
        brand: Brand.MAX2MAX
      };

      (prisma.customer.update as jest.Mock).mockResolvedValue(mockCustomer);

      const result = await customerService.updateSportAndBrand(
        mockLineUserId,
        SportType.SOCCER
      );

      // 축구 종목과 MAX2MAX 브랜드로 업데이트되었는지 검증
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { lineUserId: mockLineUserId },
        data: {
          sportType: SportType.SOCCER,
          brand: 'MAX2MAX'
        }
      });
      expect(result).toEqual(mockCustomer);
    });

    // 농구 종목에 대한 스포츠 타입과 브랜드 업데이트 테스트
    // 농구는 MAX2MAX 브랜드로 자동 설정됨
    it('should update sport type and brand for basketball', async () => {
      const mockCustomer = {
        id: '1',
        lineUserId: mockLineUserId,
        sportType: SportType.BASKETBALL,
        brand: Brand.MAX2MAX
      };

      (prisma.customer.update as jest.Mock).mockResolvedValue(mockCustomer);

      const result = await customerService.updateSportAndBrand(
        mockLineUserId,
        SportType.BASKETBALL
      );

      // 농구 종목과 MAX2MAX 브랜드로 업데이트되었는지 검증
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { lineUserId: mockLineUserId },
        data: {
          sportType: SportType.BASKETBALL,
          brand: 'MAX2MAX'
        }
      });
      expect(result).toEqual(mockCustomer);
    });

    // 제공된 브랜드를 사용하는 테스트
    // 자동 설정 대신 명시적으로 제공된 브랜드를 사용
    it('should use provided brand instead of auto-setting', async () => {
      const mockCustomer = {
        id: '1',
        lineUserId: mockLineUserId,
        sportType: SportType.BASEBALL,
        brand: Brand.MAX2MAX // 야구에 MAX2MAX 사용 (드문 경우이지만 허용됨)
      };

      (prisma.customer.update as jest.Mock).mockResolvedValue(mockCustomer);

      const result = await customerService.updateSportAndBrand(
        mockLineUserId,
        SportType.BASEBALL,
        'MAX2MAX'
      );

      // 명시적으로 제공된 MAX2MAX 브랜드가 사용되었는지 검증
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { lineUserId: mockLineUserId },
        data: {
          sportType: SportType.BASEBALL,
          brand: 'MAX2MAX'
        }
      });
      expect(result).toEqual(mockCustomer);
    });

    // 업데이트 오류 처리 테스트
    // 데이터베이스 오류 발생 시 적절하게 처리되는지 확인
    it('should handle update errors', async () => {
      const error = new Error('데이터베이스 오류');
      (prisma.customer.update as jest.Mock).mockRejectedValue(error);

      // 오류가 적절히 전파되는지 검증
      await expect(
        customerService.updateSportAndBrand(mockLineUserId, SportType.BASEBALL)
      ).rejects.toThrow('데이터베이스 오류');
    });
  });

  // findByLineUserId 메서드 테스트
  // LINE 사용자 ID로 고객을 찾는 기능 테스트
  describe('findByLineUserId', () => {
    // LINE 사용자 ID로 고객을 찾는 테스트
    it('should find customer by LINE user ID', async () => {
      const mockCustomer = {
        id: '1',
        lineUserId: 'U123456789',
        name: '테스트 사용자'
      };

      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(mockCustomer);

      const result = await customerService.findByLineUserId('U123456789');

      // LINE 사용자 ID로 검색하는 쿼리가 올바른지 검증
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { lineUserId: 'U123456789' }
      });
      // 결과가 예상한 고객 데이터와 일치하는지 확인
      expect(result).toEqual(mockCustomer);
    });

    // 고객을 찾을 수 없을 때 null을 반환하는 테스트
    it('should return null if customer not found', async () => {
      // 고객이 존재하지 않는 경우
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await customerService.findByLineUserId('U999999999');

      // null이 반환되었는지 확인
      expect(result).toBeNull();
    });
  });
});