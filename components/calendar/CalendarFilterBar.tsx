'use client';

import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { CALENDAR_STATUS_LABELS } from '@/components/calendar/CalendarEventChip';
import type { CalendarEventStatus } from '@/types/calendar';
import type { Site } from '@/types/sites';
import type { Study, CrcOption } from '@/types/studies';

export type CalendarFilterState = {
  site_id: string;
  study_id: string;
  status: string;
  crc_user_id: string;
};

export const EMPTY_CALENDAR_FILTERS: CalendarFilterState = {
  site_id: '',
  study_id: '',
  status: '',
  crc_user_id: '',
};

const STATUS_OPTIONS: CalendarEventStatus[] = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
];

export function CalendarFilterBar({
  filters,
  onChange,
  onReset,
  sites,
  studies,
  crcOptions,
}: {
  filters: CalendarFilterState;
  onChange: (patch: Partial<CalendarFilterState>) => void;
  onReset: () => void;
  sites: Site[];
  studies: Study[];
  crcOptions: CrcOption[];
}) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="w-40">
        <Select
          label="Site"
          placeholder="All sites"
          value={filters.site_id}
          onChange={(e) => onChange({ site_id: e.target.value })}
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      <div className="w-48">
        <Select
          label="Study"
          placeholder="All studies"
          value={filters.study_id}
          onChange={(e) => onChange({ study_id: e.target.value })}
          options={studies.map((s) => ({ value: s.id, label: s.study_name }))}
        />
      </div>
      <div className="w-40">
        <Select
          label="Status"
          placeholder="All statuses"
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value })}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: CALENDAR_STATUS_LABELS[s] }))}
        />
      </div>
      <div className="w-48">
        <Select
          label="CRC"
          placeholder="All CRCs"
          value={filters.crc_user_id}
          onChange={(e) => onChange({ crc_user_id: e.target.value })}
          options={crcOptions.map((c) => ({ value: c.user_id, label: c.full_name }))}
        />
      </div>
      {hasActiveFilters && (
        <Button size="sm" variant="ghost" onClick={onReset}>
          Reset filters
        </Button>
      )}
    </div>
  );
}
