import { CustomerTeamService } from '../customer-team.service';
import { prisma } from '../prisma';
import { CustomerTeam } from '../../../generated/prisma';

// 테스트 데이터를 위한 타입 정의
// 고객 정보가 포함된 CustomerTeam 타입
type CustomerTeamWithCustomer = CustomerTeam & {
  customer: {
    id: string;
    lineUserName: string;
  };
};

// Prisma 모의 객체 설정
// 데이터베이스 호출을 실제로 수행하지 않고 테스트하기 위해 mock 사용
jest.mock('../prisma', () => ({
  prisma: {
    customerTeam: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    }
  }
}));
jest.mock('../../../utils/logger');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// CustomerTeamService 테스트 스위트
// 고객과 팀의 관계를 관리하는 서비스의 모든 기능을 테스트
describe('CustomerTeamService', () => {
  let service: CustomerTeamService;

  // 각 테스트 전에 실행되는 설정
  // 모든 mock 함수를 초기화하고 서비스 인스턴스를 새로 생성
  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerTeamService();
  });

  // addTeamToCustomer 메서드 테스트
  // 고객에게 새로운 팀을 추가하는 기능 테스트
  describe('addTeamToCustomer', () => {
    // 새로운 팀을 고객에게 추가하는 테스트
    it('should add new team to customer', async () => {
      const customerId = 'customer-1';
      const teamName = '서울라이온즈';  // 한국 팀명으로 변경

      // 기존에 해당 팀이 없다고 가정
      (mockPrisma.customerTeam.findUnique as jest.Mock).mockResolvedValue(null);
      // 새 팀 관계가 생성됨
      (mockPrisma.customerTeam.create as jest.Mock).mockResolvedValue({
        id: 'customer-team-1',
        customerId,
        teamName,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await service.addTeamToCustomer(customerId, teamName);

      // 중복 팀 확인이 제대로 수행되었는지 검증
      expect(mockPrisma.customerTeam.findUnique).toHaveBeenCalledWith({
        where: {
          customerId_teamName: {
            customerId,
            teamName
          }
        }
      });
      // 새 팀 관계가 올바른 데이터로 생성되었는지 검증
      expect(mockPrisma.customerTeam.create).toHaveBeenCalledWith({
        data: {
          customer: { connect: { id: customerId } },
          teamName,
          isActive: true
        }
      });
      // 결과 검증
      expect(result.teamName).toBe(teamName);
      expect(result.isActive).toBe(true);
    });

    // 비활성화된 기존 팀을 재활성화하는 테스트
    // 이미 존재하지만 비활성 상태인 팀을 다시 활성화
    it('should reactivate existing inactive team', async () => {
      const customerId = 'customer-1';
      const teamName = '서울라이온즈';
      // 비활성 상태의 기존 팀 데이터
      const existingTeam = {
        id: 'customer-team-1',
        customerId,
        teamName,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockPrisma.customerTeam.findUnique as jest.Mock).mockResolvedValue(existingTeam);
      (mockPrisma.customerTeam.update as jest.Mock).mockResolvedValue({
        ...existingTeam,
        isActive: true
      });

      const result = await service.addTeamToCustomer(customerId, teamName);

      // 팀이 활성화 상태로 업데이트되었는지 검증
      expect(mockPrisma.customerTeam.update).toHaveBeenCalledWith({
        where: { id: 'customer-team-1' },
        data: { isActive: true }
      });
      // 결과가 활성 상태인지 확인
      expect(result.isActive).toBe(true);
    });

    // 이미 활성 상태인 팀은 수정하지 않고 반환하는 테스트
    it('should return existing active team without modification', async () => {
      const customerId = 'customer-1';
      const teamName = '서울라이온즈';
      // 이미 활성 상태인 팀 데이터
      const existingTeam = {
        id: 'customer-team-1',
        customerId,
        teamName,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockPrisma.customerTeam.findUnique as jest.Mock).mockResolvedValue(existingTeam);

      const result = await service.addTeamToCustomer(customerId, teamName);

      // 생성이나 업데이트가 호출되지 않았는지 검증
      expect(mockPrisma.customerTeam.create).not.toHaveBeenCalled();
      expect(mockPrisma.customerTeam.update).not.toHaveBeenCalled();
      // 기존 데이터가 그대로 반환되었는지 확인
      expect(result).toEqual(existingTeam);
    });
  });

  // findByCustomerId 메서드 테스트
  // 특정 고객의 모든 팀을 조회하는 기능 테스트
  describe('findByCustomerId', () => {
    // 고객의 모든 활성 팀을 반환하는 테스트
    it('should return all active teams for customer', async () => {
      const customerId = 'customer-1';
      // 테스트용 팀 데이터 (한국 팀명으로 변경)
      const teams = [
        {
          id: 'team-1',
          customerId,
          teamName: '서울라이온즈',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'team-2',
          customerId,
          teamName: '부산이글스',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      (mockPrisma.customerTeam.findMany as jest.Mock).mockResolvedValue(teams);

      const result = await service.findByCustomerId(customerId);

      // 활성 팀만 조회하는 쿼리가 올바른지 검증
      expect(mockPrisma.customerTeam.findMany).toHaveBeenCalledWith({
        where: {
          customerId,
          isActive: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      // 2개의 팀이 반환되었는지 확인
      expect(result).toHaveLength(2);
    });

    // 비활성 팀을 포함한 모든 팀을 반환하는 테스트
    // activeOnly가 false일 때 비활성 팀도 포함하여 조회
    it('should return all teams including inactive when activeOnly is false', async () => {
      const customerId = 'customer-1';
      const teams = [
        {
          id: 'team-1',
          customerId,
          teamName: '서울라이온즈',
          isActive: true
        },
        {
          id: 'team-2',
          customerId,
          teamName: '부산이글스',
          isActive: false  // 비활성 상태
        }
      ];

      (mockPrisma.customerTeam.findMany as jest.Mock).mockResolvedValue(teams);

      const result = await service.findByCustomerId(customerId, false);

      // isActive 조건 없이 모든 팀을 조회하는지 검증
      expect(mockPrisma.customerTeam.findMany).toHaveBeenCalledWith({
        where: {
          customerId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      // 활성/비활성 포함하여 2개의 팀이 반환되었는지 확인
      expect(result).toHaveLength(2);
    });
  });

  // removeTeamFromCustomer 메서드 테스트
  // 고객으로부터 팀을 제거(비활성화)하는 기능 테스트
  describe('removeTeamFromCustomer', () => {
    // 활성 팀을 비활성화하는 테스트
    it('should deactivate existing active team', async () => {
      const customerId = 'customer-1';
      const teamName = '서울라이온즈';
      const existingTeam = {
        id: 'team-1',
        customerId,
        teamName,
        isActive: true
      };

      (mockPrisma.customerTeam.findUnique as jest.Mock).mockResolvedValue(existingTeam);
      (mockPrisma.customerTeam.update as jest.Mock).mockResolvedValue({
        ...existingTeam,
        isActive: false
      });

      const result = await service.removeTeamFromCustomer(customerId, teamName);

      // 팀이 비활성화 상태로 업데이트되었는지 검증
      expect(mockPrisma.customerTeam.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { isActive: false }
      });
      // 결과가 비활성 상태인지 확인
      expect(result?.isActive).toBe(false);
    });

    // 팀을 찾을 수 없을 때의 처리 테스트
    it('should return null if team not found', async () => {
      // 팀이 존재하지 않는 경우
      (mockPrisma.customerTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.removeTeamFromCustomer('customer-1', '존재하지않는팀');

      // null이 반환되고 업데이트가 호출되지 않았는지 검증
      expect(result).toBeNull();
      expect(mockPrisma.customerTeam.update).not.toHaveBeenCalled();
    });

    // 이미 비활성 상태인 팀을 제거하려고 할 때의 처리 테스트
    it('should return null if team is already inactive', async () => {
      // 이미 비활성 상태인 팀 데이터
      const existingTeam = {
        id: 'team-1',
        customerId: 'customer-1',
        teamName: '서울라이온즈',
        isActive: false
      };

      (mockPrisma.customerTeam.findUnique as jest.Mock).mockResolvedValue(existingTeam);

      const result = await service.removeTeamFromCustomer('customer-1', '서울라이온즈');

      // 이미 비활성 상태이므로 null 반환, 업데이트 호출 안 함
      expect(result).toBeNull();
      expect(mockPrisma.customerTeam.update).not.toHaveBeenCalled();
    });
  });

  // checkDuplicateTeam 메서드 테스트
  // 중복된 팀명을 검사하는 기능 테스트
  describe('checkDuplicateTeam', () => {
    // 중복된 팀명을 감지하는 테스트
    it('should detect duplicate team names', async () => {
      const teamName = '서울라이온즈';
      // 동일한 팀명을 가진 여러 고객의 데이터
      const existingTeams = [
        {
          id: 'ct-1',
          teamName,
          isActive: true,
          customer: {
            id: 'customer-1',
            lineUserName: '김철수'
          }
        },
        {
          id: 'ct-2',
          teamName,
          isActive: true,
          customer: {
            id: 'customer-2',
            lineUserName: '이영희'
          }
        }
      ];

      (mockPrisma.customerTeam.findMany as jest.Mock).mockResolvedValue(existingTeams);

      const result = await service.checkDuplicateTeam(teamName);

      // 중복 팀 검색 쿼리가 올바른지 검증
      expect(mockPrisma.customerTeam.findMany).toHaveBeenCalledWith({
        where: {
          teamName,
          isActive: true
        },
        include: {
          customer: {
            select: {
              id: true,
              lineUserName: true
            }
          }
        }
      });
      // 중복이 감지되었는지 확인
      expect(result.isDuplicate).toBe(true);
      // 중복된 팀을 가진 고객들의 이름이 올바른지 확인
      expect(result.existingCustomers).toEqual(['김철수', '이영희']);
    });

    // 고유한 팀명에 대해 중복이 없음을 확인하는 테스트
    it('should return no duplicates for unique team name', async () => {
      // 중복된 팀이 없는 경우 (빈 배열 반환)
      (mockPrisma.customerTeam.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.checkDuplicateTeam('새로운고유팀');

      // 중복이 없음을 확인
      expect(result.isDuplicate).toBe(false);
      expect(result.existingCustomers).toEqual([]);
    });
  });

  // findCustomersByTeamName 메서드 테스트
  // 특정 팀명을 가진 모든 고객을 찾는 기능 테스트
  describe('findCustomersByTeamName', () => {
    // 특정 팀의 모든 고객을 찾는 테스트
    it('should find all customers for a team', async () => {
      const teamName = '서울라이온즈';
      // 동일한 팀에 속한 여러 고객의 데이터
      const customerTeams = [
        {
          id: 'ct-1',
          customerId: 'customer-1',
          teamName,
          isActive: true,
          customer: {
            id: 'customer-1',
            lineUserName: '김철수'
          }
        },
        {
          id: 'ct-2',
          customerId: 'customer-2',
          teamName,
          isActive: true,
          customer: {
            id: 'customer-2',
            lineUserName: '이영희'
          }
        }
      ];

      (mockPrisma.customerTeam.findMany as jest.Mock).mockResolvedValue(customerTeams);

      const result = await service.findCustomersByTeamName(teamName);

      // 팀명으로 고객을 검색하는 쿼리가 올바른지 검증
      expect(mockPrisma.customerTeam.findMany).toHaveBeenCalledWith({
        where: {
          teamName,
          isActive: true
        },
        include: {
          customer: true
        }
      });
      // 2명의 고객이 반환되었는지 확인
      expect(result).toHaveLength(2);
      // 첫 번째 고객의 이름이 올바른지 확인
      expect((result[0] as CustomerTeamWithCustomer).customer.lineUserName).toBe('김철수');
    });

    // 고객이 없을 때 빈 배열을 반환하는 테스트
    it('should return empty array if no customers found', async () => {
      // 해당 팀에 고객이 없는 경우
      (mockPrisma.customerTeam.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.findCustomersByTeamName('존재하지않는팀');

      // 빈 배열이 반환되었는지 확인
      expect(result).toEqual([]);
    });
  });
});