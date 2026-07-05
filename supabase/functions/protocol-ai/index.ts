// Supabase Edge Function: protocol-ai
// Receives { file_id, study_id }. Loads the protocol PDF from the `protocols` storage
// bucket, calls Claude (claude-sonnet-4-6) with the Protocol Agent prompt
// (docs/CI_02_Protocol_Agent.md), and writes one `study_ai_extractions` row per
// extraction type. Never activates anything automatically — all rows are inserted
// with approved=false and require explicit human approval via
// StudyService.approveAIExtraction().

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are the ClinicalOS Protocol Agent.

Goal: convert a clinical trial study protocol into a draft ClinicalOS study.

Inputs: a protocol PDF (and, if provided, amendments or supporting manuals).

Rules:
- Never activate anything automatically — your output is always a draft for human review.
- Always produce a confidence score (0.0-1.0) for the extraction as a whole.
- Highlight uncertain extractions explicitly rather than guessing silently.

Respond with a single JSON object, no prose, no markdown fences, matching exactly this shape:

{
  "confidence": 0.0,
  "uncertain_fields": ["field_name", ...],
  "study_profile": {
    "study_name": "",
    "protocol_number": "",
    "sponsor": "",
    "cro": "",
    "phase": "",
    "therapeutic_area": "",
    "start_date": null,
    "end_date": null
  },
  "visit_template": {
    "items": [
      { "visit_name": "", "visit_order": 1, "offset_days": 0, "window_before": 0, "window_after": 0, "visit_type": "scheduled", "is_required": true, "notes": "" }
    ]
  },
  "inclusion_criteria": ["..."],
  "exclusion_criteria": ["..."],
  "schedule_of_assessments": { "assessments": [] },
  "required_documents": ["Protocol", "ICF", "Investigator Brochure"]
}`;

type ExtractionPayload = {
  confidence: number;
  uncertain_fields: string[];
  study_profile: Record<string, unknown>;
  visit_template: { items: unknown[] };
  inclusion_criteria: unknown[];
  exclusion_criteria: unknown[];
  schedule_of_assessments: Record<string, unknown>;
  required_documents: unknown[];
};

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase credentials' }, 500);
    }
    if (!anthropicApiKey) {
      return jsonResponse({ error: 'Missing ANTHROPIC_API_KEY' }, 500);
    }

    const { file_id, study_id } = (await req.json().catch(() => ({}))) as {
      file_id?: string;
      study_id?: string;
    };

    if (!file_id || !study_id) {
      return jsonResponse({ error: 'file_id and study_id are required' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: fileRow, error: fileError } = await supabase
      .from('files')
      .select('id, company_id, storage_path, mime_type')
      .eq('id', file_id)
      .single();

    if (fileError || !fileRow) {
      return jsonResponse({ error: 'File not found' }, 404);
    }

    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from('protocols')
      .download(fileRow.storage_path);

    if (downloadError || !pdfBlob) {
      return jsonResponse({ error: `Failed to download file: ${downloadError?.message}` }, 500);
    }

    const pdfBase64 = arrayBufferToBase64(await pdfBlob.arrayBuffer());

    const extraction = await callProtocolAgent(pdfBase64, anthropicApiKey);

    const companyId = fileRow.company_id as string;
    const rows = [
      {
        company_id: companyId,
        study_id,
        extraction_type: 'study_profile',
        confidence: extraction.confidence,
        extracted_data: extraction.study_profile,
        approved: false,
      },
      {
        company_id: companyId,
        study_id,
        extraction_type: 'visit_template',
        confidence: extraction.confidence,
        extracted_data: extraction.visit_template,
        approved: false,
      },
      {
        company_id: companyId,
        study_id,
        extraction_type: 'inclusion_criteria',
        confidence: extraction.confidence,
        extracted_data: { criteria: extraction.inclusion_criteria },
        approved: false,
      },
      {
        company_id: companyId,
        study_id,
        extraction_type: 'exclusion_criteria',
        confidence: extraction.confidence,
        extracted_data: { criteria: extraction.exclusion_criteria },
        approved: false,
      },
      {
        company_id: companyId,
        study_id,
        extraction_type: 'schedule_of_assessments',
        confidence: extraction.confidence,
        extracted_data: extraction.schedule_of_assessments,
        approved: false,
      },
    ];

    const { data: inserted, error: insertError } = await supabase
      .from('study_ai_extractions')
      .insert(rows)
      .select('id, extraction_type');

    if (insertError || !inserted) {
      return jsonResponse({ error: `Failed to store extraction: ${insertError?.message}` }, 500);
    }

    await supabase.from('files').update({ ai_processed: true }).eq('id', file_id);

    const primary = (inserted as Array<{ id: string; extraction_type: string }>).find(
      (r) => r.extraction_type === 'study_profile',
    );

    return jsonResponse({
      extraction_id: primary?.id ?? inserted[0]?.id ?? null,
      uncertain_fields: extraction.uncertain_fields,
      confidence: extraction.confidence,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[protocol-ai] unexpected error:', message);
    return jsonResponse({ error: message }, 500);
  }
});

async function callProtocolAgent(
  pdfBase64: string,
  apiKey: string,
): Promise<ExtractionPayload> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: 'Extract the structured study data as JSON exactly per the schema in the system prompt.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.find((c) => c.type === 'text')?.text ?? '';

  return parseExtraction(text);
}

function parseExtraction(text: string): ExtractionPayload {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return lowConfidenceFallback('Model did not return parseable JSON');
  }
  try {
    const parsed = JSON.parse(match[0]);
    return {
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      uncertain_fields: Array.isArray(parsed.uncertain_fields) ? parsed.uncertain_fields : [],
      study_profile: parsed.study_profile ?? {},
      visit_template: parsed.visit_template ?? { items: [] },
      inclusion_criteria: parsed.inclusion_criteria ?? [],
      exclusion_criteria: parsed.exclusion_criteria ?? [],
      schedule_of_assessments: parsed.schedule_of_assessments ?? {},
      required_documents: parsed.required_documents ?? [],
    };
  } catch {
    return lowConfidenceFallback('Failed to parse model JSON output');
  }
}

function lowConfidenceFallback(reason: string): ExtractionPayload {
  return {
    confidence: 0,
    uncertain_fields: ['all — ' + reason],
    study_profile: {},
    visit_template: { items: [] },
    inclusion_criteria: [],
    exclusion_criteria: [],
    schedule_of_assessments: {},
    required_documents: [],
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
