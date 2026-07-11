import { type NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { acceptInvitationSchema } from '@/lib/utils/validation';
import { InvitationService } from '@/services/invitations/InvitationService';
import { NotFoundError, ConflictError, ValidationError, AuthError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = acceptInvitationSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  try {
    const result = await InvitationService.acceptInvitation(
      {
        token: validated.data.token,
        fullName: validated.data.full_name,
        password: validated.data.password,
      },
      ip,
    );

    return successResponse(result, 'Account created successfully', 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', 422, { message: error.message });
    }
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 404, { message: error.message });
    }
    if (error instanceof ConflictError) {
      return errorResponse('CONFLICT', 409, { message: error.message });
    }
    if (error instanceof AuthError) {
      return errorResponse('UNAUTHORIZED', 401, { message: error.message });
    }

    logger.error('POST /api/invitations/accept failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
