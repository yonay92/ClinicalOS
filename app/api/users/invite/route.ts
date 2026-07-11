import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { sendInvitationSchema } from '@/lib/utils/validation';
import { InvitationService } from '@/services/invitations/InvitationService';
import { PermissionDeniedError, ConflictError, ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = sendInvitationSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const result = await InvitationService.sendInvitation(
      {
        email: validated.data.email,
        roleIds: validated.data.role_ids,
        siteIds: validated.data.site_ids,
      },
      { user: auth.user, company: auth.company },
    );
    return successResponse(result, 'Invitation sent', 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof ConflictError) {
      return errorResponse('DUPLICATE_RECORD', 409, { message: error.message });
    }
    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', 422, { message: error.message });
    }
    logger.error('POST /api/users/invite failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
