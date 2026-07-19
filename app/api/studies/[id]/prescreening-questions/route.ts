import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { createPrescreeningQuestionSchema } from '@/lib/utils/validation';
import { PrescreeningService } from '@/services/recruitment/PrescreeningService';
import { PermissionDeniedError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  try {
    const questions = await PrescreeningService.listQuestions(id, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(questions);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('GET /api/studies/[id]/prescreening-questions failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = createPrescreeningQuestionSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    const question = await PrescreeningService.createQuestion(id, validated.data, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(question, 'Prescreening question created', 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    logger.error('POST /api/studies/[id]/prescreening-questions failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
