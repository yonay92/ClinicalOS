import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError, DuplicateRecordError } from '@/lib/api/errors';
import type {
  ReferralSource,
  CreateReferralSourceInput,
  UpdateReferralSourceInput,
} from '@/types/recruitment';
import type { RequestContext } from '@/types/api';

const REFERRAL_SOURCE_COLUMNS = 'id, company_id, name, category, active, created_at, updated_at';

export const ReferralSourceService = {
  async list(ctx: RequestContext, includeInactive = false): Promise<ReferralSource[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_leads');

    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('referral_sources')
      .select(REFERRAL_SOURCE_COLUMNS)
      .eq('company_id', ctx.company.id)
      .order('name');

    if (!includeInactive) query = query.eq('active', true);

    const { data, error } = await query;
    if (error) throw new DatabaseError(error.message);
    return (data as ReferralSource[]) ?? [];
  },

  async create(input: CreateReferralSourceInput, ctx: RequestContext): Promise<ReferralSource> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_referral_sources');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('referral_sources')
      .insert({ company_id: ctx.company.id, name: input.name, category: input.category })
      .select(REFERRAL_SOURCE_COLUMNS)
      .single();

    if (error || !data) {
      if ((error as { code?: string } | null)?.code === '23505') {
        throw new DuplicateRecordError('name');
      }
      throw new DatabaseError(error?.message ?? 'Failed to create referral source');
    }

    const source = data as ReferralSource;

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'referral_source.created',
      module: 'recruitment',
      record_type: 'referral_sources',
      record_id: source.id,
      new_value: { name: source.name, category: source.category },
    });

    return source;
  },

  async update(
    id: string,
    input: UpdateReferralSourceInput,
    ctx: RequestContext,
  ): Promise<ReferralSource> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_referral_sources');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('referral_sources')
      .update(input)
      .eq('id', id)
      .eq('company_id', ctx.company.id)
      .select(REFERRAL_SOURCE_COLUMNS)
      .single();

    if (error || !data) throw new NotFoundError('Referral source');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'referral_source.updated',
      module: 'recruitment',
      record_type: 'referral_sources',
      record_id: id,
      new_value: input as Record<string, unknown>,
    });

    return data as ReferralSource;
  },
};
