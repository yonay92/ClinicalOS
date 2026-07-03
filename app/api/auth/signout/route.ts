import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { AuthService } from '@/services/auth/AuthService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);

  if (!auth.ok) {
    return successResponse(null, 'Signed out');
  }

  try {
    await AuthService.signOut(auth.user.id, auth.company.id);
    return successResponse(null, 'Signed out successfully');
  } catch (error) {
    logger.error('POST /api/auth/signout failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
