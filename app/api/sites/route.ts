import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { createSiteSchema } from '@/lib/utils/validation';
import { SiteService } from '@/services/sites/SiteService';
import { PermissionDeniedError, DuplicateRecordError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { searchParams } = request.nextUrl;
  const view = searchParams.get('view');

  try {
    const sites = await SiteService.list(
      { user: auth.user, company: auth.company },
      {
        search: searchParams.get('search') ?? undefined,
        view: view === 'archived' || view === 'all' || view === 'active' ? view : undefined,
      },
    );
    return successResponse(sites);
  } catch (error) {
    logger.error('GET /api/sites failed', {
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

  const validated = createSiteSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  const input = Object.fromEntries(
    Object.entries(validated.data).filter(([, v]) => v !== undefined),
  ) as Parameters<typeof SiteService.create>[0];

  try {
    const site = await SiteService.create(input, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(site, 'Site created', 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof DuplicateRecordError) {
      return errorResponse('DUPLICATE_RECORD', 409, { message: error.message });
    }
    logger.error('POST /api/sites failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
