import express, { Application } from 'express';
import { config, validateConfig } from './config';
import logger from './utils/logger';
import { requestLoggingMiddleware } from './middlewares/logging';
import { errorHandlerMiddleware } from './middlewares/error-handler';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import lineRoutes from './routes/line';
import lineTestRoutes from './routes/line-test';
import slackRoutes from './routes/slack';
// import { connectDatabase, disconnectDatabase } from './services/database';

// 설정 검증
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed', { error });
  process.exit(1);
}

const app: Application = express();

// 미들웨어 설정
app.use(requestLoggingMiddleware);

// LINE 웹훅은 서명 검증을 위해 raw body가 필요함
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use('/webhook-test', express.raw({ type: 'application/json' }));

// 다른 라우트를 위한 body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우트
app.use('/', lineRoutes);
app.use('/', lineTestRoutes);
app.use('/slack', slackRoutes);

// 개발 환경에서만 테스트 라우트 및 Swagger 추가
if (config.nodeEnv === 'development') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info('Test routes and Swagger UI enabled (development mode)');
  logger.info(`Swagger UI available at: http://localhost:${config.port}/api-docs`);
}

// 헬스 체크 엔드포인트
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// 에러 처리 미들웨어 (마지막에 위치해야 함)
app.use(errorHandlerMiddleware);

// 서버 시작
const startServer = async () => {
  try {
    // 데이터베이스 연결 (테스트를 위해 주석 처리)
    // await connectDatabase();

    const server = app.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port} in ${config.nodeEnv} mode`);
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Graceful shutdown initiated');

      server.close(() => {
        logger.info('HTTP server closed');
      });

      try {
        // await disconnectDatabase();
        // logger.info('Database connection closed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();

export default app;