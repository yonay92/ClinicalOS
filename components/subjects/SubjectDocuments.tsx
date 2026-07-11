'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePermissions } from '@/hooks/usePermissions';
import type { SubjectDocument } from '@/types/subjects';

export function SubjectDocuments({ subjectId }: { subjectId: string }) {
  const { hasPermission } = usePermissions();
  const [documents, setDocuments] = useState<SubjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/documents`);
      if (res.ok) {
        const json = (await res.json()) as { data: SubjectDocument[] };
        setDocuments(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/subjects/${subjectId}/documents`, {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to upload document');
        return;
      }
      await fetchDocuments();
    } catch {
      setError('An unexpected error occurred during upload');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="space-y-4">
      {hasPermission('edit_subject') && (
        <div className="space-y-3">
          {error && (
            <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
          )}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            {uploading ? (
              <>
                <LoadingSpinner size="lg" />
                <p className="mt-3 text-sm text-gray-600">Uploading...</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  Drop a file here, or click to browse
                </p>
                <p className="mt-1 text-xs text-gray-500">Up to 25MB</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Files uploaded for this subject appear here"
        />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {doc.document_type ?? 'Document'}
                </p>
                <p className="text-xs text-gray-500">
                  Uploaded {new Date(doc.uploaded_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
