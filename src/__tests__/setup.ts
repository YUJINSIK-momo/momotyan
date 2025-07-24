
// 전역 테스트 설정
process.env.NODE_ENV = 'test';

// 전역 타임아웃 설정
jest.setTimeout(10000);

// 전역 모킹
jest.mock('../utils/logger', () => {
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

// 전역 정리
afterEach(() => {
  jest.clearAllMocks();
});

// Jest를 만족시키기 위한 더미 테스트 추가
describe('Setup', () => {
  it('should have test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});