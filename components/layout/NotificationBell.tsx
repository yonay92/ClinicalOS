'use client';

import { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { Badge } from '@/components/ui';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 flex max-h-96 w-80 flex-col rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void markAsRead(n.id)}
                    className={`w-full border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50 ${!n.is_read ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && (
                        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                      )}
                      <div className={!n.is_read ? '' : 'pl-4'}>
                        <p className="line-clamp-2 text-xs font-medium text-gray-900">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{n.body}</p>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <Badge
                            variant={
                              n.priority === 'critical'
                                ? 'danger'
                                : n.priority === 'high'
                                  ? 'warning'
                                  : 'default'
                            }
                          >
                            {n.priority}
                          </Badge>
                          <span className="text-[10px] text-gray-400">
                            {new Date(n.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
