import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { PermissionService } from '@/services/permissions/PermissionService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  try {
    const permissions = await PermissionService.getUserPermissions(auth.user.id);
    return successResponse({ permissions });
  } catch (error) {
    logger.error('GET /api/users/me/permissions failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
