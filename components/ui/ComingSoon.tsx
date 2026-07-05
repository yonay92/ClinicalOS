import { PageHeader } from '@/components/ui/PageHeader';

interface ComingSoonProps {
  module: string;
}

export function ComingSoon({ module }: ComingSoonProps) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={module} />

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <svg
              className="h-7 w-7 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h2 className="mb-2 text-xl font-semibold text-gray-900">{module}</h2>
          <p className="text-sm text-gray-500">
            This module will be implemented in a future sprint.
          </p>
        </div>
      </div>
    </div>
  );
}
