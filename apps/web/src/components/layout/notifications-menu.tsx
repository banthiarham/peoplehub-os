'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  metadata: { link?: string } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data as { count: number }),
    refetchInterval: 60_000,
  });
  const { data: list } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () =>
      api.get('/notifications?page=1').then((r) => r.data as { data: NotificationRow[] }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const count = unread?.count ?? 0;
  const rows = list?.data ?? [];

  const openNotification = (n: NotificationRow) => {
    if (!n.isRead) markRead.mutate(n.id);
    const link = n.metadata?.link;
    if (link) {
      setOpen(false);
      router.push(link);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative rounded-2xl border border-line bg-white p-2.5 text-ink-muted shadow-sm hover:border-primary-200 hover:bg-canvas"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {count > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[26rem] overflow-y-auto p-2">
            {rows.length ? (
              rows.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={cn(
                    'flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-canvas last:border-0',
                    !n.isRead && 'bg-primary-50/35',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.isRead ? 'bg-transparent' : 'bg-primary-600',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-4 py-10 text-center text-sm text-ink-muted">
                {list ? "You're all caught up." : 'Loading…'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
