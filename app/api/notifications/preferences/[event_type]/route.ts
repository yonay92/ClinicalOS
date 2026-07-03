import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updateNotificationPreferenceSchema } from '@/lib/utils/validation';
import { NotificationService } from '@/services/notifications/NotificationService';
import { logger } from '@/lib/logger';

const VALID_EVENT_TYPES = new Set([
  'task_created',
  'task_assigned',
  'task_overdue',
  'task_completed',
  'document_expiring',
  'document_expired',
  'document_uploaded',
  'chart_ready',
  'chart_overdue',
  'visit_out_of_window',
  'sponsor_visit_approaching',
  'ai_review_pending',
  'ai_request_failed',
  'subject_status_changed',
  'user_invited',
  'ai_budget_warning',
  'study_activated',
  'protocol_amendment',
  'business_rule_failed',
]);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ event_type: string }> },
) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const { event_type } = await params;

  if (!VALID_EVENT_TYPES.has(event_type)) {
    return errorResponse('VALIDATION_ERROR', 400, { message: `Unknown event type: ${event_type}` });
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = updateNotificationPreferenceSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    await NotificationService.updatePreference(
      auth.user.id,
      auth.company.id,
      event_type,
      validated.data,
    );
    return successResponse({ event_type, ...validated.data }, 'Preference updated');
  } catch (error) {
    logger.error('PUT /api/notifications/preferences/[event_type] failed', {
      event_type,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
