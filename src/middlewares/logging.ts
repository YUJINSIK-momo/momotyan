import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, url, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    logger.info('Request completed', { // 요청 완료
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ip
    });
  });

  next();
}