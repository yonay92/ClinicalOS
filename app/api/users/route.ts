import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { UserService } from '@/services/users/UserService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { searchParams } = request.nextUrl;
  const filters: { status?: string; role?: string; site?: string } = {};
  const status = searchParams.get('status');
  const role = searchParams.get('role');
  const site = searchParams.get('site');
  if (status) filters.status = status;
  if (role) filters.role = role;
  if (site) filters.site = site;

  try {
    const users = await UserService.list({ user: auth.user, company: auth.company }, filters);
    return successResponse(users);
  } catch (error) {
    logger.error('GET /api/users failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
