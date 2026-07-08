'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { CreateVisitTemplateItemInput } from '@/types/studies';

export type VisitItemDraft = CreateVisitTemplateItemInput & { key: string };

export function makeVisitItemKey(): string {
  return Math.random().toString(36).slice(2);
}

export function emptyVisitItem(order: number): VisitItemDraft {
  return {
    key: makeVisitItemKey(),
    visit_name: '',
    visit_order: order,
    offset_days: 0,
    window_before: 0,
    window_after: 0,
    visit_type: 'scheduled',
    is_required: true,
    is_baseline: false,
  };
}

export function SortableVisitItemRow({
  item,
  onChange,
  onSetBaseline,
  onRemove,
}: {
  item: VisitItemDraft;
  onChange: (key: string, patch: Partial<VisitItemDraft>) => void;
  onSetBaseline: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-600"
        aria-label="Reorder visit"
      >
        ⠿
      </button>
      <div className="flex-1">
        <Input
          value={item.visit_name}
          onChange={(e) => onChange(item.key, { visit_name: e.target.value })}
          placeholder="Visit name (e.g. Screening)"
        />
      </div>
      <div className="w-24">
        <Input
          type="number"
          value={item.offset_days ?? 0}
          onChange={(e) => onChange(item.key, { offset_days: Number(e.target.value) })}
          placeholder="Day offset"
        />
      </div>
      <div className="w-20">
        <Input
          type="number"
          value={item.window_before ?? 0}
          onChange={(e) => onChange(item.key, { window_before: Number(e.target.value) })}
          placeholder="-Window"
        />
      </div>
      <div className="w-20">
        <Input
          type="number"
          value={item.window_after ?? 0}
          onChange={(e) => onChange(item.key, { window_after: Number(e.target.value) })}
          placeholder="+Window"
        />
      </div>
      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={item.is_required ?? true}
          onChange={(e) => onChange(item.key, { is_required: e.target.checked })}
        />
        Required
      </label>
      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input
          type="radio"
          name="visit-template-baseline"
          checked={item.is_baseline ?? false}
          onChange={() => onSetBaseline(item.key)}
        />
        Baseline
      </label>
      <Button variant="ghost" size="sm" onClick={() => onRemove(item.key)}>
        Remove
      </Button>
    </div>
  );
}
