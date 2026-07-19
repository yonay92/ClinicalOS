import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updatePrescreeningQuestionSchema } from '@/lib/utils/validation';
import { PrescreeningService } from '@/services/recruitment/PrescreeningService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id, questionId } = await params;

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = updatePrescreeningQuestionSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  const input = Object.fromEntries(
    Object.entries(validated.data).filter(([, v]) => v !== undefined),
  ) as Parameters<typeof PrescreeningService.updateQuestion>[1];

  try {
    const question = await PrescreeningService.updateQuestion(questionId, input, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(question, 'Prescreening question updated');
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('PATCH /api/studies/[id]/prescreening-questions/[questionId] failed', {
      id,
      questionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
