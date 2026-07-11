import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updateCompanySettingsSchema } from '@/lib/utils/validation';
import { CompanyService } from '@/services/company/CompanyService';
import { PermissionDeniedError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  try {
    const settings = await CompanyService.getSettings(auth.company.id);
    return successResponse({ settings });
  } catch (error) {
    logger.error('GET /api/company/settings failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = updateCompanySettingsSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  // Strip undefined values so optional fields don't accidentally overwrite DB columns
  const input = Object.fromEntries(
    Object.entries(validated.data).filter(([, v]) => v !== undefined),
  ) as Parameters<typeof CompanyService.updateSettings>[0];

  try {
    const settings = await CompanyService.updateSettings(input, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(settings, 'Settings updated');
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('PATCH /api/company/settings failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
