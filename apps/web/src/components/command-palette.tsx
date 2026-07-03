'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  FileText,
  Laptop,
  LifeBuoy,
  Search,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '@/lib/api';
import { NAV_SECTIONS } from '@/config/nav';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SearchResults {
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    workEmail: string | null;
    designation: { name: string } | null;
    department: { name: string } | null;
  }>;
  candidates: Array<{
    id: string;
    firstName: string;
    lastName: string;
    currentStage: string;
    jobRequisition: { title: string };
  }>;
  tickets: Array<{ id: string; subject: string; status: string; category: string }>;
  jobs: Array<{ id: string; title: string; status: string; openings: number }>;
  assets: Array<{ id: string; name: string; category: string; status: string }>;
}

interface PaletteItem {
  key: string;
  section: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
}

const PaletteContext = createContext<() => void>(() => {});

export function useCommandPalette() {
  return useContext(PaletteContext);
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query, 200);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const { data } = useQuery<SearchResults>({
    queryKey: ['search', 'global', debounced],
    queryFn: () =>
      api.get('/search/global', { params: { q: debounced } }).then((r) => r.data),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const pages: PaletteItem[] = NAV_SECTIONS.flatMap((s) => s.items)
      .filter((i) => !q || i.label.toLowerCase().includes(q))
      .slice(0, q ? 4 : 8)
      .map((i) => ({
        key: `page-${i.href}`,
        section: 'Go to',
        icon: <i.icon className="h-4 w-4 text-ink-muted" />,
        title: i.label,
        href: i.href,
      }));

    if (!data || q.length < 2) return pages;

    return [
      ...pages,
      ...data.employees.map((e) => ({
        key: `emp-${e.id}`,
        section: 'Employees',
        icon: <Users className="h-4 w-4 text-primary-600" />,
        title: `${e.firstName} ${e.lastName}`,
        subtitle: `${e.employeeCode} · ${e.designation?.name ?? ''} ${e.department?.name ? `· ${e.department.name}` : ''}`,
        href: `/employees/${e.id}`,
      })),
      ...data.candidates.map((c) => ({
        key: `cand-${c.id}`,
        section: 'Candidates',
        icon: <Briefcase className="h-4 w-4 text-amber-600" />,
        title: `${c.firstName} ${c.lastName}`,
        subtitle: c.jobRequisition.title,
        badge: c.currentStage.replace(/_/g, ' '),
        href: `/recruitment`,
      })),
      ...data.tickets.map((t) => ({
        key: `tkt-${t.id}`,
        section: 'Tickets',
        icon: <LifeBuoy className="h-4 w-4 text-blue-600" />,
        title: t.subject,
        subtitle: t.category,
        badge: t.status.replace(/_/g, ' '),
        href: `/helpdesk`,
      })),
      ...data.jobs.map((j) => ({
        key: `job-${j.id}`,
        section: 'Jobs',
        icon: <FileText className="h-4 w-4 text-violet-600" />,
        title: j.title,
        subtitle: `${j.openings} opening${j.openings > 1 ? 's' : ''}`,
        badge: j.status,
        href: `/recruitment`,
      })),
      ...data.assets.map((a) => ({
        key: `asset-${a.id}`,
        section: 'Assets',
        icon: <Laptop className="h-4 w-4 text-teal-600" />,
        title: a.name,
        subtitle: a.category,
        badge: a.status.replace(/_/g, ' '),
        href: `/assets`,
      })),
    ];
  }, [data, query]);

  useEffect(() => setActive(0), [items.length, debounced]);

  const select = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      select(items[active]);
    }
  }

  let lastSection = '';

  return (
    <PaletteContext.Provider value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-xl translate-y-0 p-0 [&>button]:hidden">
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search people, candidates, tickets, jobs, assets…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
            <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-ink-faint">
              esc
            </kbd>
          </div>
          <div className="scrollbar-thin max-h-[50vh] overflow-y-auto p-2">
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-ink-muted">
                No results for “{query}”
              </p>
            )}
            {items.map((item, idx) => {
              const showHeader = item.section !== lastSection;
              lastSection = item.section;
              return (
                <div key={item.key}>
                  {showHeader && (
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                      {item.section}
                    </p>
                  )}
                  <button
                    onClick={() => select(item)}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                      idx === active ? 'bg-primary-50' : '',
                    )}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      {item.subtitle && (
                        <span className="block truncate text-xs text-ink-muted">{item.subtitle}</span>
                      )}
                    </span>
                    {item.badge && <Badge variant="outline">{item.badge}</Badge>}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}
