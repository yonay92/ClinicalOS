import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updateSiteSchema } from '@/lib/utils/validation';
import { SiteService } from '@/services/sites/SiteService';
import { PermissionDeniedError, NotFoundError, DuplicateRecordError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  try {
    const site = await SiteService.getById(id, { user: auth.user, company: auth.company });
    return successResponse(site);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('GET /api/sites/[id] failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = updateSiteSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  const input = Object.fromEntries(
    Object.entries(validated.data).filter(([, v]) => v !== undefined),
  ) as Parameters<typeof SiteService.update>[1];

  try {
    const site = await SiteService.update(id, input, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(site, 'Site updated');
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    if (error instanceof DuplicateRecordError) {
      return errorResponse('DUPLICATE_RECORD', 409, { message: error.message });
    }
    logger.error('PATCH /api/sites/[id] failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
