import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { NotificationService } from '@/services/notifications/NotificationService';
import { logger } from '@/lib/logger';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  try {
    await NotificationService.markAsRead(id, auth.user.id);
    return successResponse({ id }, 'Notification marked as read');
  } catch (error) {
    logger.error('PATCH /api/notifications/[id]/read failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
