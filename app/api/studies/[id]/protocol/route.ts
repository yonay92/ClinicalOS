import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { StudyService } from '@/services/studies/StudyService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

// Uploads a (possibly amended) protocol to an existing study. Used for protocol
// amendments — StudyService.uploadProtocol() detects an active study and treats
// the upload as an amendment (bumps protocol_version, notifies Regulatory/CRC).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!file || !(file instanceof File)) {
    return errorResponse('VALIDATION_ERROR', 400, { message: 'A protocol file is required' });
  }
  if (file.type !== 'application/pdf') {
    return errorResponse('VALIDATION_ERROR', 400, { message: 'Only PDF protocols are supported' });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return errorResponse('VALIDATION_ERROR', 400, { message: 'File exceeds the 25MB limit' });
  }

  try {
    const result = await StudyService.uploadProtocol(id, file, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(result, 'Protocol uploaded — AI extraction in progress', 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('POST /api/studies/[id]/protocol failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
