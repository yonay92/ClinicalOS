import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { SubjectService } from '@/services/subjects/SubjectService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { id } = await params;

  try {
    const documents = await SubjectService.listDocuments(id, {
      user: auth.user,
      company: auth.company,
    });
    return successResponse(documents);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('GET /api/subjects/[id]/documents failed', {
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

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  const documentType = formData?.get('document_type');

  if (!file || !(file instanceof File)) {
    return errorResponse('VALIDATION_ERROR', 400, { message: 'A document file is required' });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return errorResponse('VALIDATION_ERROR', 400, { message: 'File exceeds the 25MB limit' });
  }

  try {
    const document = await SubjectService.uploadDocument(
      id,
      file,
      { user: auth.user, company: auth.company },
      typeof documentType === 'string' ? documentType : undefined,
    );
    return successResponse(document, 'Document uploaded', 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) return errorResponse('FORBIDDEN', 403);
    if (error instanceof NotFoundError) return errorResponse('NOT_FOUND', 404);
    logger.error('POST /api/subjects/[id]/documents failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
