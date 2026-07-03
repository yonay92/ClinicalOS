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
      .from('roles')
      .select(
        `
        id, company_id, name, key, description, is_system_role, created_at, updated_at,
        role_permissions(
          id, allowed,
          permissions(id, key, module, description)
        )
      `,
      )
      .eq('company_id', auth.company.id)
      .order('name');

    if (error) throw error;
    return successResponse({ roles: data ?? [] });
  } catch (error) {
    logger.error('GET /api/roles failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
