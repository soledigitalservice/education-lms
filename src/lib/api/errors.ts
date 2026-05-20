import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
  /** Per-field zod issues (only present on validation errors). */
  issues?: Array<{ path: string; message: string }>;
}

/**
 * Typed application error. Routes throw these (or any Error / Prisma error)
 * and the wrapper in handler.ts normalises the response.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(msg: string): ApiError {
    return new ApiError(400, 'BadRequest', msg);
  }
  static unauthorized(msg = 'Not authenticated'): ApiError {
    return new ApiError(401, 'Unauthorized', msg);
  }
  static forbidden(msg = 'Forbidden'): ApiError {
    return new ApiError(403, 'Forbidden', msg);
  }
  static notFound(msg = 'Not found'): ApiError {
    return new ApiError(404, 'NotFound', msg);
  }
  static conflict(msg: string): ApiError {
    return new ApiError(409, 'Conflict', msg);
  }
  static tooManyRequests(msg = 'Too many requests'): ApiError {
    return new ApiError(429, 'TooManyRequests', msg);
  }
}

/**
 * Translate any thrown value into a normalised JSON error response.
 *
 *   - ApiError       → its own status + code
 *   - ZodError       → 400 with per-field issues
 *   - Prisma errors  → mapped to 4xx where appropriate
 *   - Anything else  → 500 (logged, no internals leaked)
 */
export function toErrorResponse(err: unknown, path: string): NextResponse<ApiErrorBody> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  if (err instanceof ApiError) {
    return NextResponse.json<ApiErrorBody>(
      {
        statusCode: err.status,
        error: err.code,
        message: err.message,
        requestId,
        timestamp,
        path,
      },
      { status: err.status, headers: { 'x-request-id': requestId } },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json<ApiErrorBody>(
      {
        statusCode: 400,
        error: 'ValidationError',
        message: 'Request payload failed validation',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId,
        timestamp,
        path,
      },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    return NextResponse.json<ApiErrorBody>(
      { ...mapped, requestId, timestamp, path },
      { status: mapped.statusCode, headers: { 'x-request-id': requestId } },
    );
  }

  // Unknown error — log full stack server-side, return generic message to client.
  // eslint-disable-next-line no-console
  console.error(`[${requestId}] Unhandled error on ${path}:`, err);

  return NextResponse.json<ApiErrorBody>(
    {
      statusCode: 500,
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      requestId,
      timestamp,
      path,
    },
    { status: 500, headers: { 'x-request-id': requestId } },
  );
}

function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): Pick<ApiErrorBody, 'statusCode' | 'error' | 'message'> {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return {
        statusCode: 409,
        error: 'Conflict',
        message: `A record with this ${target} already exists`,
      };
    }
    case 'P2025':
      return {
        statusCode: 404,
        error: 'NotFound',
        message: (err.meta?.cause as string | undefined) ?? 'Record not found',
      };
    case 'P2003':
      return {
        statusCode: 400,
        error: 'BadRequest',
        message: 'Referenced record does not exist',
      };
    default:
      return {
        statusCode: 500,
        error: 'DatabaseError',
        message: `Database error (${err.code})`,
      };
  }
}
