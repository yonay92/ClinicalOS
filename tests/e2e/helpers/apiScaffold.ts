import type { APIRequestContext } from '@playwright/test';

export type VisitTemplateItemInput = {
  visit_name: string;
  visit_order: number;
  offset_days: number;
  window_before: number;
  window_after: number;
  visit_type: 'scheduled' | 'unscheduled';
  is_baseline: boolean;
  is_required: boolean;
};

/**
 * Creates a Study, assigns the given Site, creates + approves a Visit
 * Template, and activates the Study — all through the real API (never raw
 * SQL), so business rules (GAP-REQ-03's approved-template gate,
 * activateStudy's approved-template requirement) are exercised exactly as
 * the UI would trigger them. Shared by global-setup.ts and any spec that
 * needs its own throwaway active study (e.g. subject-creation.spec.ts)
 * rather than coupling to another file's fixtures.
 */
export async function scaffoldActiveStudy(
  context: APIRequestContext,
  opts: { studyName: string; siteId: string; items: VisitTemplateItemInput[] },
): Promise<{ studyId: string }> {
  const createStudyRes = await context.post('/api/studies', {
    data: { study_name: opts.studyName },
  });
  if (!createStudyRes.ok()) {
    throw new Error(
      `scaffoldActiveStudy: study creation failed: ${createStudyRes.status()} ${await createStudyRes.text()}`,
    );
  }
  const study = ((await createStudyRes.json()) as { data: { id: string } }).data;

  const assignSiteRes = await context.patch(`/api/studies/${study.id}`, {
    data: { site_ids: [opts.siteId] },
  });
  if (!assignSiteRes.ok()) {
    throw new Error(
      `scaffoldActiveStudy: site assignment failed: ${assignSiteRes.status()} ${await assignSiteRes.text()}`,
    );
  }

  const createTemplateRes = await context.post(`/api/studies/${study.id}/visit-templates`, {
    data: { items: opts.items },
  });
  if (!createTemplateRes.ok()) {
    throw new Error(
      `scaffoldActiveStudy: visit template creation failed: ${createTemplateRes.status()} ${await createTemplateRes.text()}`,
    );
  }
  const template = ((await createTemplateRes.json()) as { data: { id: string } }).data;

  const approveRes = await context.post(`/api/visit-templates/${template.id}/approve`);
  if (!approveRes.ok()) {
    throw new Error(
      `scaffoldActiveStudy: template approval failed: ${approveRes.status()} ${await approveRes.text()}`,
    );
  }

  const activateRes = await context.patch(`/api/studies/${study.id}`, {
    data: { status: 'active' },
  });
  if (!activateRes.ok()) {
    throw new Error(
      `scaffoldActiveStudy: study activation failed: ${activateRes.status()} ${await activateRes.text()}`,
    );
  }

  return { studyId: study.id };
}
