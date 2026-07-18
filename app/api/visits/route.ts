import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { listCalendarEventsSchema } from '@/lib/utils/validation';
import { VisitService } from '@/services/visits/VisitService';
import { PermissionDeniedError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { searchParams } = new URL(request.url);
  const validated = listCalendarEventsSchema.safeParse({
    start: searchParams.get('start') ?? undefined,
    end: searchParams.get('end') ?? undefined,
    site_id: searchParams.get('site_id') ?? undefined,
    study_id: searchParams.get('study_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    crc_user_id: searchParams.get('crc_user_id') ?? undefined,
  });
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const events = await VisitService.listCalendarEvents(validated.data, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(events);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('GET /api/visits failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
