'use client';

import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type StatCardProps = {
  label: string;
  value: string | number;
  description?: string;
};

function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {description && <p className="mt-1 text-xs text-gray-400">{description}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (auth.status === 'unauthenticated') {
    return null;
  }

  const { profile, company } = auth;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile.full_name.split(' ').at(0) ?? profile.full_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{company.name} · Clinical Research Operations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Studies" value="—" description="Loading..." />
        <StatCard label="Enrolled Subjects" value="—" description="Loading..." />
        <StatCard label="Open Tasks" value="—" description="Loading..." />
        <StatCard label="Pending Documents" value="—" description="Loading..." />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Recent Activity</h2>
        <p className="text-sm text-gray-500">
          Activity feed will appear here as you use ClinicalOS.
        </p>
      </div>
    </div>
  );
}
