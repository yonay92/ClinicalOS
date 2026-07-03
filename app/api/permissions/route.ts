import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('permissions')
      .select('id, key, module, description, created_at')
      .order('module')
      .order('key');

    if (error) throw error;
    return successResponse({ permissions: data ?? [] });
  } catch (error) {
    logger.error('GET /api/permissions failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
