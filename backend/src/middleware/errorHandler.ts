import { Request, Response, NextFunction } from 'express';

interface CustomError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error Handler:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404, status: 'error' };
  }

  // Mongoose duplicate key
  if (err.name === 'MongoError' && (err as any).code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400, status: 'error' };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors)
      .map((error: any) => error.message)
      .join(', ');
    error = { message, statusCode: 400, status: 'error' };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401, status: 'error' };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401, status: 'error' };
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        const message = 'Duplicate entry';
        error = { message, statusCode: 400, status: 'error' };
        break;
      case '23503': // foreign_key_violation
        const messageFK = 'Referenced resource does not exist';
        error = { message: messageFK, statusCode: 400, status: 'error' };
        break;
      case '23502': // not_null_violation
        const messageNN = 'Required field is missing';
        error = { message: messageNN, statusCode: 400, status: 'error' };
        break;
      default:
        const messageDB = 'Database error';
        error = { message: messageDB, statusCode: 500, status: 'error' };
    }
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};
