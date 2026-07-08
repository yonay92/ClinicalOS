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
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/Button';
import { AlertBanner } from '@/components/ui/AlertBanner';
import {
  SortableVisitItemRow,
  emptyVisitItem,
  type VisitItemDraft,
} from '@/components/studies/VisitItemRow';

type DraftItem = VisitItemDraft;

export function VisitTemplateBuilder({
  studyId,
  onSaved,
}: {
  studyId: string;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<DraftItem[]>([emptyVisitItem(1)]);
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
    setItems((prev) => [...prev, emptyVisitItem(prev.length + 1)]);
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
      setItems([emptyVisitItem(1)]);
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
              <SortableVisitItemRow
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
