// src/components/DailyPlan/SortableList.jsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id, render }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start space-x-2 mb-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab p-1 rounded hover:bg-gray-100 mt-1 select-none"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        // for better touch behavior
        style={{ touchAction: "none" }}
      >
        {/* low-effort drag handle glyph */}
        <span aria-hidden>⋮⋮</span>
      </button>
      <div className="flex-1">{render()}</div>
    </div>
  );
}

/**
 * items: array you’re rendering
 * onReorder: (fromIdx, toIdx) => void
 * renderItem: (index) => JSX inside the row
 * idPrefix: stable prefix to make ids unique per-list
 */
export default function SortableList({ items, onReorder, renderItem, idPrefix = "item" }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }) // click to edit, drag after 6px
  );

  // Using index-based ids is fine here since we update them every render consistently.
  const ids = (items || []).map((_, i) => `${idPrefix}-${i}`);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(active.id);
        const to = ids.indexOf(over.id);
        if (from !== -1 && to !== -1 && from !== to) onReorder(from, to);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {(items || []).map((_, i) => (
          <SortableItem key={ids[i]} id={ids[i]} render={() => renderItem(i)} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
