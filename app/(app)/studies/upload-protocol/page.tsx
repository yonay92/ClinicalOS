'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProtocolUploader } from '@/components/studies/ProtocolUploader';

export default function UploadProtocolPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Upload Protocol"
        description="Upload a protocol PDF and let the Protocol Agent draft the study for your review"
      />
      <ProtocolUploader
        onUploaded={(result) => {
          if (result.draft?.id) router.push(`/studies/ai-drafts/${result.draft.id}`);
        }}
      />
    </div>
  );
}
