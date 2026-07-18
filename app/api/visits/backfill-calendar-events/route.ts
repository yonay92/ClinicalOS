import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { VisitService } from '@/services/visits/VisitService';
import { PermissionDeniedError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  try {
    const result = await VisitService.backfillCalendarEvents({
      user: auth.user,
      company: auth.company,
    });
    const message =
      result.failed > 0
        ? `Checked ${result.checked} visit(s), created ${result.created}, failed ${result.failed} (see server logs)`
        : `Checked ${result.checked} visit(s), created ${result.created} missing calendar event(s)`;
    return successResponse(result, message);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('POST /api/visits/backfill-calendar-events failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
