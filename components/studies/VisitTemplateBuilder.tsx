'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { CreateVisitTemplateItemInput } from '@/types/studies';

type DraftItem = CreateVisitTemplateItemInput & { key: string };

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyItem(order: number): DraftItem {
  return {
    key: makeKey(),
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

function SortableRow({
  item,
  onChange,
  onSetBaseline,
  onRemove,
}: {
  item: DraftItem;
  onChange: (key: string, patch: Partial<DraftItem>) => void;
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

export function VisitTemplateBuilder({
  studyId,
  onSaved,
}: {
  studyId: string;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<DraftItem[]>([emptyItem(1)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleChange(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function handleSetBaseline(key: string) {
    setItems((prev) => prev.map((i) => ({ ...i, is_baseline: i.key === key })));
  }

  function handleRemove(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function handleAdd() {
    setItems((prev) => [...prev, emptyItem(prev.length + 1)]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.key === active.id);
      const newIndex = prev.findIndex((i) => i.key === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      return reordered.map((item, idx) => ({ ...item, visit_order: idx + 1 }));
    });
  }

  async function handleSave() {
    if (items.some((i) => !i.visit_name.trim())) {
      setError('Every visit needs a name');
      return;
    }
    if (items.filter((i) => i.is_baseline).length !== 1) {
      setError('Mark exactly one visit as Baseline');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/visit-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ key: _key, ...rest }) => rest),
        }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to save visit template');
        return;
      }
      onSaved();
      setItems([emptyItem(1)]);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableRow
                key={item.key}
                item={item}
                onChange={handleChange}
                onSetBaseline={handleSetBaseline}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={handleAdd}>
          Add Visit
        </Button>
        <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
          Save as Draft
        </Button>
      </div>
    </div>
  );
}
