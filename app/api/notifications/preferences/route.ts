import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { NotificationService } from '@/services/notifications/NotificationService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  try {
    const preferences = await NotificationService.getUserPreferences(auth.user.id, auth.company.id);
    return successResponse(preferences);
  } catch (error) {
    logger.error('GET /api/notifications/preferences failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
