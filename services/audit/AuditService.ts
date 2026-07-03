import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export type AuditLogInput = {
  company_id: string;
  site_id?: string | null;
  user_id?: string | null;
  action: string;
  module: string;
  record_type?: string;
  record_id?: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
};

export const AuditService = {
  async log(input: AuditLogInput): Promise<void> {
    try {
      // Audit logs are inserted with the server client (RLS INSERT policy allows company members)
      // For service-role contexts (invitation acceptance), use admin client
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.from('audit_logs').insert({
        company_id: input.company_id,
        site_id: input.site_id ?? null,
        user_id: input.user_id ?? null,
        action: input.action,
        module: input.module,
        record_type: input.record_type ?? null,
        record_id: input.record_id ?? null,
        old_value: input.old_value ?? null,
        new_value: input.new_value ?? null,
        ip_address: input.ip_address ?? null,
        user_agent: input.user_agent ?? null,
      });

      if (error) {
        logger.error('AuditService.log: insert failed', {
          error: error.message,
          action: input.action,
          module: input.module,
        });
      }
    } catch (err) {
      // Audit logging failures must never crash the primary operation
      logger.error('AuditService.log: unexpected error', {
        error: err instanceof Error ? err.message : String(err),
        action: input.action,
      });
    }
  },

  async logWithAdmin(input: AuditLogInput): Promise<void> {
    try {
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase.from('audit_logs').insert({
        company_id: input.company_id,
        site_id: input.site_id ?? null,
        user_id: input.user_id ?? null,
        action: input.action,
        module: input.module,
        record_type: input.record_type ?? null,
        record_id: input.record_id ?? null,
        old_value: input.old_value ?? null,
        new_value: input.new_value ?? null,
        ip_address: input.ip_address ?? null,
        user_agent: input.user_agent ?? null,
      });

      if (error) {
        logger.error('AuditService.logWithAdmin: insert failed', {
          error: error.message,
          action: input.action,
        });
      }
    } catch (err) {
      logger.error('AuditService.logWithAdmin: unexpected error', {
        error: err instanceof Error ? err.message : String(err),
        action: input.action,
      });
    }
  },
};
