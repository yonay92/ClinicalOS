import { type NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { signInSchema } from '@/lib/utils/validation';
import { AuthService } from '@/services/auth/AuthService';
import { AuthError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = signInSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const { profile } = await AuthService.signIn(validated.data.email, validated.data.password);
    return successResponse({ profile }, 'Signed in successfully');
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse('UNAUTHORIZED', 401, { message: error.message });
    }
    if (error instanceof NotFoundError) {
      return errorResponse('UNAUTHORIZED', 401, { message: 'Account not found' });
    }
    logger.error('POST /api/auth/signin failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
