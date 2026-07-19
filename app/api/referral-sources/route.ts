import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { createReferralSourceSchema } from '@/lib/utils/validation';
import { ReferralSourceService } from '@/services/recruitment/ReferralSourceService';
import { PermissionDeniedError, DuplicateRecordError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const includeInactive = request.nextUrl.searchParams.get('view') === 'all';

  try {
    const sources = await ReferralSourceService.list(
      { user: auth.user, company: auth.company },
      includeInactive,
    );
    return successResponse(sources);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('GET /api/referral-sources failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = createReferralSourceSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const source = await ReferralSourceService.create(validated.data, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(source, 'Referral source created', 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof DuplicateRecordError) {
      return errorResponse('DUPLICATE_RECORD', 409, { message: error.message });
    }
    logger.error('POST /api/referral-sources failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
