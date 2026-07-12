'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { CalendarView } from '@/components/calendar/CalendarView';

export default function CalendarPage() {
  return (
    <div>
      <PageHeader title="Calendar" description="Scheduled patient visits across your sites" />
      <CalendarView />
    </div>
  );
}
