import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotificationService } from '@/services/notifications/NotificationService';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { NotFoundError, DatabaseError, BusinessRuleError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import type {
  Study,
  StudyStatus,
  CreateStudyInput,
  UpdateStudyInput,
  StudySite,
  StudyAiExtraction,
  FileRecord,
} from '@/types/studies';
import type { RequestContext } from '@/types/api';

const STUDY_COLUMNS =
  'id, company_id, study_name, protocol_number, sponsor, cro, phase, therapeutic_area, status, start_date, end_date, protocol_version, ai_generated, created_by, created_at, updated_at';

export type StudyListFilters = {
  status?: StudyStatus | undefined;
  site_id?: string | undefined;
  sponsor?: string | undefined;
  therapeutic_area?: string | undefined;
};

export type UpdateStudyServiceInput = UpdateStudyInput & { site_ids?: string[] };

export const StudyService = {
  async list(filters: StudyListFilters, ctx: RequestContext): Promise<Study[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_studies');

    const supabase = await createServerSupabaseClient();

    if (filters.site_id) {
      const { data } = await supabase
        .from('study_sites')
        .select(`studies!inner(${STUDY_COLUMNS})`)
        .eq('company_id', ctx.company.id)
        .eq('site_id', filters.site_id);

      let studies = ((data as Array<{ studies: Study }> | null) ?? []).map((r) => r.studies);
      if (filters.status) studies = studies.filter((s) => s.status === filters.status);
      if (filters.sponsor) studies = studies.filter((s) => s.sponsor === filters.sponsor);
      if (filters.therapeutic_area) {
        studies = studies.filter((s) => s.therapeutic_area === filters.therapeutic_area);
      }
      return studies;
    }

    let query = supabase.from('studies').select(STUDY_COLUMNS).eq('company_id', ctx.company.id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.sponsor) query = query.eq('sponsor', filters.sponsor);
    if (filters.therapeutic_area) query = query.eq('therapeutic_area', filters.therapeutic_area);

    const { data } = await query.order('created_at', { ascending: false });
    return (data as Study[]) ?? [];
  },

  async getById(studyId: string, ctx: RequestContext): Promise<Study> {
    await PermissionService.requirePermission(ctx.user.id, 'view_studies');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('studies')
      .select(STUDY_COLUMNS)
      .eq('id', studyId)
      .eq('company_id', ctx.company.id)
      .single();

    if (error || !data) throw new NotFoundError('Study');
    return data as Study;
  },

  async create(input: CreateStudyInput, ctx: RequestContext): Promise<Study> {
    await PermissionService.requirePermission(ctx.user.id, 'create_study');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('studies')
      .insert({
        company_id: ctx.company.id,
        created_by: ctx.user.id,
        status: 'draft',
        ai_generated: false,
        ...input,
      })
      .select(STUDY_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to create study');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'study.created',
      module: 'studies',
      record_type: 'studies',
      record_id: (data as Study).id,
      new_value: input as Record<string, unknown>,
    });

    return data as Study;
  },

  async createFromProtocol(
    file: File,
    ctx: RequestContext,
  ): Promise<{ study: Study; extraction_id: string | null }> {
    await PermissionService.requirePermission(ctx.user.id, 'create_study');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('studies')
      .insert({
        company_id: ctx.company.id,
        created_by: ctx.user.id,
        status: 'draft',
        ai_generated: true,
        study_name: `Draft study — ${file.name}`,
      })
      .select(STUDY_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to create draft study');

    const study = data as Study;

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'study.created',
      module: 'studies',
      record_type: 'studies',
      record_id: study.id,
      new_value: { source: 'protocol_upload', file_name: file.name },
    });

    const { extraction_id } = await this.uploadProtocol(study.id, file, ctx);
    return { study, extraction_id };
  },

  async uploadProtocol(
    studyId: string,
    file: File,
    ctx: RequestContext,
  ): Promise<{ file: FileRecord; extraction_id: string | null }> {
    await PermissionService.requireAnyPermission(ctx.user.id, [
      'create_study',
      'edit_study',
      'manage_studies',
    ]);

    const study = await this.getById(studyId, ctx);

    const supabase = await createServerSupabaseClient();
    const storagePath = `${ctx.company.id}/${studyId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('protocols')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      throw new DatabaseError(`Protocol upload failed: ${uploadError.message}`);
    }

    const fileExtension = file.name.includes('.') ? file.name.split('.').pop() : null;

    const { data: fileRow, error: fileError } = await supabase
      .from('files')
      .insert({
        company_id: ctx.company.id,
        file_name: file.name,
        original_name: file.name,
        file_extension: fileExtension,
        mime_type: file.type || null,
        file_size: file.size,
        storage_path: storagePath,
        uploaded_by: ctx.user.id,
      })
      .select(
        'id, company_id, file_name, original_name, file_extension, mime_type, file_size, storage_path, uploaded_by, uploaded_at, checksum, ai_processed',
      )
      .single();

    if (fileError || !fileRow) {
      throw new DatabaseError(fileError?.message ?? 'Failed to record uploaded file');
    }

    await supabase.from('study_documents').insert({
      company_id: ctx.company.id,
      study_id: studyId,
      file_id: (fileRow as FileRecord).id,
      document_type: 'protocol',
      uploaded_by: ctx.user.id,
    });

    const isAmendment = study.status === 'active';

    let extractionId: string | null = null;
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('protocol-ai', {
        body: { file_id: (fileRow as FileRecord).id, study_id: studyId },
      });
      if (fnError) {
        logger.error('protocol-ai invocation failed', { error: fnError.message, studyId });
      } else {
        extractionId = (fnData as { extraction_id?: string } | null)?.extraction_id ?? null;
      }
    } catch (err) {
      logger.error('protocol-ai invocation threw', {
        error: err instanceof Error ? err.message : String(err),
        studyId,
      });
    }

    if (isAmendment) {
      await supabase
        .from('studies')
        .update({ protocol_version: `${(study.protocol_version ?? '1.0')}-amended-${Date.now()}` })
        .eq('id', studyId)
        .eq('company_id', ctx.company.id);

      await this.notifyAssignedSites(studyId, ctx.company.id, 'protocol_amendment', ['regulatory', 'crc'], {
        study_name: study.study_name,
      });
    }

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: isAmendment ? 'study.protocol_amended' : 'study.protocol_uploaded',
      module: 'studies',
      record_type: 'studies',
      record_id: studyId,
      new_value: { file_name: file.name, extraction_id: extractionId },
    });

    return { file: fileRow as FileRecord, extraction_id: extractionId };
  },

  async approveAIExtraction(
    extractionId: string,
    ctx: RequestContext,
    expectedStudyId?: string,
  ): Promise<StudyAiExtraction> {
    await PermissionService.requireAnyPermission(ctx.user.id, ['edit_study', 'manage_studies']);

    const supabase = await createServerSupabaseClient();
    const { data: extraction, error } = await supabase
      .from('study_ai_extractions')
      .select(
        'id, company_id, study_id, extraction_type, confidence, extracted_data, reviewed_by, reviewed_at, approved, created_at',
      )
      .eq('id', extractionId)
      .eq('company_id', ctx.company.id)
      .single();

    if (error || !extraction) throw new NotFoundError('AI extraction');
    if (expectedStudyId && (extraction as StudyAiExtraction).study_id !== expectedStudyId) {
      throw new NotFoundError('AI extraction');
    }

    const row = extraction as StudyAiExtraction;
    const extracted = row.extracted_data ?? {};

    if (row.extraction_type === 'study_profile') {
      const fields = [
        'study_name',
        'protocol_number',
        'sponsor',
        'cro',
        'phase',
        'therapeutic_area',
        'start_date',
        'end_date',
      ] as const;
      const update: Record<string, unknown> = {};
      for (const field of fields) {
        if (extracted[field] !== undefined) update[field] = extracted[field];
      }
      if (Object.keys(update).length > 0) {
        await supabase
          .from('studies')
          .update(update)
          .eq('id', row.study_id)
          .eq('company_id', ctx.company.id);
      }
    }

    if (row.extraction_type === 'visit_template') {
      const items = Array.isArray(extracted.items) ? extracted.items : [];
      if (items.length > 0) {
        await VisitTemplateService.createTemplate(row.study_id, items, ctx, 'ai_generated');
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('study_ai_extractions')
      .update({ approved: true, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', extractionId)
      .select(
        'id, company_id, study_id, extraction_type, confidence, extracted_data, reviewed_by, reviewed_at, approved, created_at',
      )
      .single();

    if (updateError || !updated) {
      throw new DatabaseError(updateError?.message ?? 'Failed to approve extraction');
    }

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'study.ai_extraction_approved',
      module: 'studies',
      record_type: 'study_ai_extractions',
      record_id: extractionId,
      new_value: { extraction_type: row.extraction_type, study_id: row.study_id },
    });

    return updated as StudyAiExtraction;
  },

  async listAiExtractions(studyId: string, ctx: RequestContext): Promise<StudyAiExtraction[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_studies');
    await this.getById(studyId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('study_ai_extractions')
      .select(
        'id, company_id, study_id, extraction_type, confidence, extracted_data, reviewed_by, reviewed_at, approved, created_at',
      )
      .eq('study_id', studyId)
      .eq('company_id', ctx.company.id)
      .order('created_at', { ascending: false });

    return (data as StudyAiExtraction[]) ?? [];
  },

  async assignSites(studyId: string, siteIds: string[], ctx: RequestContext): Promise<StudySite[]> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_studies');
    await this.getById(studyId, ctx);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('study_sites')
      .upsert(
        siteIds.map((siteId) => ({
          company_id: ctx.company.id,
          study_id: studyId,
          site_id: siteId,
          status: 'active',
        })),
        { onConflict: 'study_id,site_id', ignoreDuplicates: true },
      )
      .select('id, company_id, study_id, site_id, status, created_at');

    if (error) throw new DatabaseError(error.message);

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'study.sites_assigned',
      module: 'studies',
      record_type: 'studies',
      record_id: studyId,
      new_value: { site_ids: siteIds },
    });

    return (data as StudySite[]) ?? [];
  },

  async activateStudy(studyId: string, ctx: RequestContext): Promise<Study> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_studies');

    const study = await this.getById(studyId, ctx);
    if (study.status === 'active') return study;
    if (study.status === 'closed' || study.status === 'archived') {
      throw new BusinessRuleError(`Cannot activate a study with status "${study.status}"`);
    }

    const hasApprovedTemplate = await VisitTemplateService.hasApprovedTemplate(
      studyId,
      ctx.company.id,
    );
    if (!hasApprovedTemplate) {
      throw new BusinessRuleError(
        'Study cannot be activated until it has an approved visit template',
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from('studies')
      .update({ status: 'active' })
      .eq('id', studyId)
      .eq('company_id', ctx.company.id)
      .select(STUDY_COLUMNS)
      .single();

    if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to activate study');

    // GAP-BL-05: auto-populate study_document_requirements from document_types.required_by_default.
    // Implemented as a plain synchronous step here — revisit via the Business Rule Engine (Sprint 9).
    const { data: requiredTypes } = await supabase
      .from('document_types')
      .select('id')
      .eq('company_id', ctx.company.id)
      .eq('required_by_default', true);

    if (requiredTypes && requiredTypes.length > 0) {
      await supabase.from('study_document_requirements').upsert(
        (requiredTypes as Array<{ id: string }>).map((t) => ({
          company_id: ctx.company.id,
          study_id: studyId,
          document_type_id: t.id,
          required: true,
        })),
        { onConflict: 'study_id,document_type_id', ignoreDuplicates: true },
      );
    }

    await this.notifyAssignedSites(studyId, ctx.company.id, 'study_activated', ['pi', 'crc'], {
      study_name: study.study_name,
    });

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'study.activated',
      module: 'studies',
      record_type: 'studies',
      record_id: studyId,
    });

    return updated as Study;
  },

  async closeStudy(studyId: string, ctx: RequestContext): Promise<Study> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_studies');

    const study = await this.getById(studyId, ctx);
    if (study.status === 'closed') return study;

    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from('studies')
      .update({ status: 'closed' })
      .eq('id', studyId)
      .eq('company_id', ctx.company.id)
      .select(STUDY_COLUMNS)
      .single();

    if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to close study');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'study.closed',
      module: 'studies',
      record_type: 'studies',
      record_id: studyId,
    });

    return updated as Study;
  },

  async update(
    studyId: string,
    input: UpdateStudyServiceInput,
    ctx: RequestContext,
  ): Promise<Study> {
    const { status, site_ids, ...fields } = input;
    let study = await this.getById(studyId, ctx);

    if (Object.keys(fields).length > 0) {
      await PermissionService.requireAnyPermission(ctx.user.id, ['edit_study', 'manage_studies']);

      const supabase = await createServerSupabaseClient();
      const { data: updated, error } = await supabase
        .from('studies')
        .update(fields)
        .eq('id', studyId)
        .eq('company_id', ctx.company.id)
        .select(STUDY_COLUMNS)
        .single();

      if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to update study');

      await AuditService.log({
        company_id: ctx.company.id,
        user_id: ctx.user.id,
        action: 'study.updated',
        module: 'studies',
        record_type: 'studies',
        record_id: studyId,
        old_value: study as unknown as Record<string, unknown>,
        new_value: fields as Record<string, unknown>,
      });

      study = updated as Study;
    }

    if (site_ids && site_ids.length > 0) {
      await this.assignSites(studyId, site_ids, ctx);
    }

    if (status && status !== study.status) {
      if (status === 'active') {
        study = await this.activateStudy(studyId, ctx);
      } else if (status === 'closed') {
        study = await this.closeStudy(studyId, ctx);
      } else {
        await PermissionService.requirePermission(ctx.user.id, 'manage_studies');
        const supabase = await createServerSupabaseClient();
        const { data: updated, error } = await supabase
          .from('studies')
          .update({ status })
          .eq('id', studyId)
          .eq('company_id', ctx.company.id)
          .select(STUDY_COLUMNS)
          .single();

        if (error || !updated) {
          throw new DatabaseError(error?.message ?? 'Failed to update study status');
        }

        await AuditService.log({
          company_id: ctx.company.id,
          user_id: ctx.user.id,
          action: 'study.status_changed',
          module: 'studies',
          record_type: 'studies',
          record_id: studyId,
          old_value: { status: study.status },
          new_value: { status },
        });

        study = updated as Study;
      }
    }

    return study;
  },

  async notifyAssignedSites(
    studyId: string,
    companyId: string,
    type: 'study_activated' | 'protocol_amendment',
    roleKeys: string[],
    context: Record<string, string>,
  ): Promise<void> {
    const admin = createAdminSupabaseClient();
    const { data: studySites } = await admin
      .from('study_sites')
      .select('site_id')
      .eq('study_id', studyId)
      .eq('company_id', companyId);

    const siteIds = ((studySites as Array<{ site_id: string }>) ?? []).map((s) => s.site_id);

    for (const siteId of siteIds) {
      for (const roleKey of roleKeys) {
        await NotificationService.dispatch({
          type,
          companyId,
          siteId,
          recipientRole: roleKey,
          relatedModule: 'studies',
          relatedRecordId: studyId,
          relatedRecordType: 'studies',
          context,
        });
      }
    }
  },
};
