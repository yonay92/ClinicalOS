import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { upsertLeadContactInfoSchema } from '@/lib/utils/validation';
import { LeadContactService } from '@/services/recruitment/LeadContactService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  try {
    const contactInfo = await LeadContactService.get(id, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(contactInfo);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('GET /api/leads/[id]/contact-info failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = upsertLeadContactInfoSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const contactInfo = await LeadContactService.upsert(id, validated.data, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(contactInfo, 'Contact information saved');
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('PUT /api/leads/[id]/contact-info failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
