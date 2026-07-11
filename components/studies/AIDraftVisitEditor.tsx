'use client';

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
import {
  SortableVisitItemRow,
  emptyVisitItem,
  type VisitItemDraft,
} from '@/components/studies/VisitItemRow';

export function AIDraftVisitEditor({
  items,
  onChange,
}: {
  items: VisitItemDraft[];
  onChange: (items: VisitItemDraft[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleChange(key: string, patch: Partial<VisitItemDraft>) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function handleSetBaseline(key: string) {
    onChange(items.map((i) => ({ ...i, is_baseline: i.key === key })));
  }

  function handleRemove(key: string) {
    onChange(items.filter((i) => i.key !== key));
  }

  function handleAdd() {
    onChange([...items, emptyVisitItem(items.length + 1)]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.key === active.id);
    const newIndex = items.findIndex((i) => i.key === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    onChange(reordered.map((item, idx) => ({ ...item, visit_order: idx + 1 })));
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No visit schedule was found in the protocol. Add visits manually, or leave empty and add
          them later.
        </p>
      ) : (
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
      )}

      <Button variant="outline" size="sm" onClick={handleAdd}>
        Add Visit
      </Button>
    </div>
  );
}
