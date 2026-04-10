import { createFileRoute } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  useAddChainNote,
  useChainNote,
  useChainNoteIds,
  useDeleteChainNote,
  useReorderChainNotes,
} from "@/chain/state/hooks";
import { DraggableList } from "@/chain/components/DraggableList";

export const Route = createFileRoute("/chain/$chainId/config/notes")({
  component: NotesPage,
});

// ─────────────────────────────────────────────────────────────────────────────
// NoteCard
// ─────────────────────────────────────────────────────────────────────────────

function NoteCard({ id, onDelete }: { id: number; onDelete: () => void }) {
  const { note, setTitle, setBody } = useChainNote(id);
  const [localTitle, setLocalTitle] = useState(note?.title ?? "");
  const [localBody, setLocalBody] = useState(note?.body ?? "");

  useEffect(() => {
    setLocalTitle(note?.title ?? "");
  }, [note?.title]);
  useEffect(() => {
    setLocalBody(note?.body ?? "");
  }, [note?.body]);

  if (!note) return null;

  return (
    <div className="aspect-square bg-surface border border-edge rounded-lg flex flex-col overflow-hidden shadow-sm group">
      {/* Header: drag zone + title + delete */}
      <div className="shrink-0 flex items-center gap-1 pl-2 pr-1.5 pt-1.5 pb-1 border-b border-line bg-accent-ring">
        {/* Narrow grip strip — non-interactive, so it activates drag */}
        <div className="shrink-0 w-1.5 self-stretch" />
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={() => {
            if (localTitle !== note.title) setTitle(localTitle);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Untitled"
          className="flex-1 min-w-0 text-sm font-semibold text-accent-tint bg-transparent outline-none placeholder:text-ghost"
        />
        <button
          onClick={onDelete}
          className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-0.5 rounded text-accent-tink hover:text-danger hover:bg-danger/10"
          title="Delete note"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body: scrollable textarea */}
      <textarea
        value={localBody}
        onChange={(e) => setLocalBody(e.target.value)}
        onBlur={() => {
          if (localBody !== note.body) setBody(localBody);
        }}
        placeholder="Write a note…"
        className="flex-1 px-3 py-2 text-sm text-ink bg-transparent outline-none resize-none overflow-y-auto leading-relaxed placeholder:text-ghost"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function NotesPage() {
  const noteIds = useChainNoteIds();
  const addNote = useAddChainNote();
  const deleteNote = useDeleteChainNote();
  const reorderNotes = useReorderChainNotes();

  return (
    <div className="py-1 flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {noteIds.length > 0 && (
          <DraggableList
            ids={noteIds}
            onReorder={reorderNotes}
            layout="grid"
            containerClassName="contents"
            renderItem={(id) => <NoteCard id={id} onDelete={() => deleteNote(id)} />}
            renderOverlay={() => (
              <div className="aspect-square rounded-lg border-2 border-accent bg-surface shadow-xl ring-2 ring-accent opacity-80 cursor-grabbing" />
            )}
          />
        )}

        {/* Add note card — not draggable */}
        <button
          type="button"
          onClick={addNote}
          className="aspect-square rounded-lg border-2 border-dashed border-edge text-ghost hover:border-accent hover:text-accent transition-colors flex items-center justify-center"
        >
          <Plus size={48} strokeWidth={1.25} />
        </button>
      </div>
    </div>
  );
}
