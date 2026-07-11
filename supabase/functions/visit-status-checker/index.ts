// Supabase Edge Function: visit-status-checker
// Runs on a daily cron schedule (docs/BUSINESS_RULE_ENGINE.md §10: "Daily 02:30: Check
// all visits for window breaches").
// Any scheduled/confirmed/rescheduled visit whose window has closed without being
// completed is transitioned to 'missed'. Writes a subject_timeline event and an
// audit_logs entry per visit, mirroring how SubjectService records every status change.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 200;
const PENDING_STATUSES = ['scheduled', 'confirmed', 'rescheduled'];

type VisitRow = {
  id: string;
  company_id: string;
  site_id: string;
  subject_id: string;
  visit_name: string;
  window_end: string;
};

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date().toISOString().slice(0, 10);

    const { data: batch, error: fetchError } = await supabase
      .from('visits')
      .select('id, company_id, site_id, subject_id, visit_name, window_end')
      .in('status', PENDING_STATUSES)
      .not('window_end', 'is', null)
      .lt('window_end', today)
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[visit-status-checker] fetch error:', fetchError.message);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = (batch ?? []) as VisitRow[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ missed: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let missed = 0;

    for (const row of rows) {
      const { error: updateError } = await supabase
        .from('visits')
        .update({ status: 'missed' })
        .eq('id', row.id)
        .in('status', PENDING_STATUSES);

      if (updateError) {
        console.error(`[visit-status-checker] update failed for ${row.id}:`, updateError.message);
        continue;
      }

      await supabase.from('subject_timeline').insert({
        company_id: row.company_id,
        subject_id: row.subject_id,
        event_type: 'visit_missed',
        event_date: new Date().toISOString(),
        description: `${row.visit_name} visit marked missed — window closed ${row.window_end}`,
        related_record_type: 'visits',
        related_record_id: row.id,
        created_by: null,
      });

      await supabase.from('audit_logs').insert({
        company_id: row.company_id,
        site_id: row.site_id,
        user_id: null,
        action: 'visit.missed',
        module: 'subjects',
        record_type: 'visits',
        record_id: row.id,
        old_value: { status: 'scheduled_or_confirmed' },
        new_value: { status: 'missed', window_end: row.window_end },
      });

      missed++;
    }

    console.log(`[visit-status-checker] checked=${rows.length} missed=${missed}`);

    return new Response(JSON.stringify({ checked: rows.length, missed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[visit-status-checker] unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
