'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePermissions } from '@/hooks/usePermissions';
import type { SubjectNote, SubjectNoteVisibility } from '@/types/subjects';

const VISIBILITY_OPTIONS: Array<{ value: SubjectNoteVisibility; label: string }> = [
  { value: 'internal', label: 'Internal' },
  { value: 'crc_only', label: 'CRC Only' },
  { value: 'admin_only', label: 'Admin Only' },
];

export function SubjectNotes({ subjectId }: { subjectId: string }) {
  const { hasPermission } = usePermissions();
  const [notes, setNotes] = useState<SubjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<SubjectNoteVisibility>('internal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/notes`);
      if (res.ok) {
        const json = (await res.json()) as { data: SubjectNote[] };
        setNotes(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  async function handleAdd() {
    if (!text.trim()) {
      setError('Note text is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text.trim(), visibility }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to add note');
        return;
      }
      setText('');
      await fetchNotes();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasPermission('edit_subject') && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="space-y-1">
            <label htmlFor="new-note" className="block text-sm font-medium text-slate-700">
              Add note
            </label>
            <textarea
              id="new-note"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="w-48">
              <Select
                label="Visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as SubjectNoteVisibility)}
                options={VISIBILITY_OPTIONS}
              />
            </div>
            <Button loading={saving} disabled={saving} onClick={() => void handleAdd()}>
              Add Note
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Notes added for this subject appear here" />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-900">{note.note}</p>
              <p className="mt-2 text-xs text-gray-500">
                {note.visibility.replace(/_/g, ' ')} · {new Date(note.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
