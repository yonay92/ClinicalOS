import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { UserService } from '@/services/users/UserService';
import { PermissionDeniedError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id, roleId } = await params;

  try {
    await UserService.removeRole(id, roleId, { user: auth.user, company: auth.company });
    return successResponse({ id, roleId }, 'Role removed');
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('DELETE /api/users/[id]/roles/[roleId] failed', {
      id,
      roleId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
