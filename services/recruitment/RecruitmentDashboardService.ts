import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { DatabaseError } from '@/lib/api/errors';
import type {
  LeadStatus,
  RecruitmentDashboard,
  RecruitmentFunnelCounts,
} from '@/types/recruitment';
import type { RequestContext } from '@/types/api';

const ALL_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'prescreening',
  'waitlisted',
  'converted',
  'declined',
  'lost',
];

export const RecruitmentDashboardService = {
  async get(ctx: RequestContext): Promise<RecruitmentDashboard> {
    await PermissionService.requirePermission(ctx.user.id, 'view_leads');

    const supabase = await createServerSupabaseClient();
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, status, referral_source_id')
      .eq('company_id', ctx.company.id);

    if (error) throw new DatabaseError(error.message);

    const rows =
      (leads as Array<{ id: string; status: LeadStatus; referral_source_id: string | null }>) ?? [];

    const funnel = ALL_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as RecruitmentFunnelCounts);
    for (const row of rows) funnel[row.status] += 1;

    const totalLeads = rows.length;
    const conversionRate = totalLeads > 0 ? funnel.converted / totalLeads : 0;

    const bySourceId = new Map<string | null, number>();
    for (const row of rows) {
      bySourceId.set(row.referral_source_id, (bySourceId.get(row.referral_source_id) ?? 0) + 1);
    }

    const sourceIds = Array.from(bySourceId.keys()).filter((id): id is string => id !== null);
    const sourceNames = new Map<string, string>();
    if (sourceIds.length > 0) {
      const { data: sources } = await supabase
        .from('referral_sources')
        .select('id, name')
        .in('id', sourceIds);
      for (const source of (sources as Array<{ id: string; name: string }>) ?? []) {
        sourceNames.set(source.id, source.name);
      }
    }

    const byReferralSource = Array.from(bySourceId.entries())
      .map(([referral_source_id, count]) => ({
        referral_source_id,
        name: referral_source_id
          ? (sourceNames.get(referral_source_id) ?? 'Unknown')
          : 'No source recorded',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      funnel,
      total_leads: totalLeads,
      conversion_rate: conversionRate,
      by_referral_source: byReferralSource,
    };
  },
};
