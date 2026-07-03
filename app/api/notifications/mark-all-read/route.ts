import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { NotificationService } from '@/services/notifications/NotificationService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  try {
    await NotificationService.markAllAsRead(auth.user.id, auth.company.id);
    return successResponse(null, 'All notifications marked as read');
  } catch (error) {
    logger.error('POST /api/notifications/mark-all-read failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
