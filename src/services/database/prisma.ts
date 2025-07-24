import { PrismaClient } from '../../generated/prisma';
import logger from '../../utils/logger';

// 전역 Prisma 클라이언트를 위한 타입 선언
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Prisma 클라이언트 인스턴스
 * 개발 환경에서는 전역 변수에 저장하여 HMR(Hot Module Replacement) 시
 * 다중 인스턴스 생성을 방지합니다.
 */
export const prisma = global.prisma || new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' }
  ]
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Prisma 이벤트 타입 정의
interface PrismaQueryEvent {
  query: string;
  duration: number;
}

interface PrismaLogEvent {
  message: string;
}

// Prisma 이벤트 리스너 설정 - 프로덕션 환경에서만 활성화
if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('query', (e: PrismaQueryEvent) => {
    logger.debug('Query: ' + e.query);
    logger.debug('Duration: ' + e.duration + 'ms');
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('info', (e: PrismaLogEvent) => {
    logger.info('Prisma info: ' + e.message);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('warn', (e: PrismaLogEvent) => {
    logger.warn('Prisma warning: ' + e.message);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('error', (e: PrismaLogEvent) => {
    logger.error('Prisma error: ' + e.message);
  });
}

/**
 * 데이터베이스에 연결합니다.
 * @returns {Promise<void>}
 * @throws {Error} 연결 실패 시 에러 발생
 */
export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Successfully connected to database');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * 데이터베이스 연결을 해제합니다.
 * @returns {Promise<void>}
 * @throws {Error} 연결 해제 실패 시 에러 발생
 */
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Successfully disconnected from database');
  } catch (error) {
    logger.error('Failed to disconnect from database:', error);
    throw error;
  }
}