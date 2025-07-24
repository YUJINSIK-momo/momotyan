import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { config } from '../config';

export function errorHandlerMiddleware(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error('Unhandled error', { // 처리되지 않은 오류
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : undefined
  });
}