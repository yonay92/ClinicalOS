'use client';

import { useState, useRef, type DragEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type ProtocolUploaderProps = {
  studyId?: string;
  onUploaded: (result: { extraction_id?: string | null; draft?: { id: string } }) => void;
};

export function ProtocolUploader({ studyId, onUploaded }: ProtocolUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const url = studyId ? `/api/studies/${studyId}/protocol` : '/api/studies/ai-drafts';
      const res = await fetch(url, { method: 'POST', body: formData });
      const json = (await res.json()) as {
        success: boolean;
        data?: { extraction_id?: string | null; draft?: { id: string } };
        message?: string;
      };

      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? 'Failed to upload protocol');
        return;
      }
      onUploaded(json.data);
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
    <div className="space-y-3">
      {error && <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
        }`}
      >
        {uploading ? (
          <>
            <LoadingSpinner size="lg" />
            <p className="mt-3 text-sm text-gray-600">
              Uploading and running AI extraction — this may take a moment...
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">
              Drop a protocol PDF here, or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-500">PDF only, up to 25MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {!uploading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
        </div>
      )}
    </div>
  );
}
