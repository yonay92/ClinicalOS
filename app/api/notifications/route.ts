import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getNotificationsSchema } from '@/lib/utils/validation';
import { NotificationService } from '@/services/notifications/NotificationService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { searchParams } = request.nextUrl;

  const validated = getNotificationsSchema.safeParse({
    is_read: searchParams.get('is_read') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const notifications = await NotificationService.getUserNotifications(
      auth.user.id,
      auth.company.id,
      validated.data.limit,
      validated.data.is_read,
    );
    return successResponse(notifications);
  } catch (error) {
    logger.error('GET /api/notifications failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
