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
          if (result.study?.id) router.push(`/studies/${result.study.id}`);
        }}
      />
    </div>
  );
}
