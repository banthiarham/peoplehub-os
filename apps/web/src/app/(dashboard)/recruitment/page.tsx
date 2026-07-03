'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, FileSignature, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';

interface PipelineStage {
  stage: string;
  count: number;
  candidates: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    source: string | null;
    jobRequisition: { title: string };
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  RECRUITER_CALL: 'Recruiter call',
  TECHNICAL_ROUND: 'Technical',
  MANAGER_ROUND: 'Manager',
  HR_ROUND: 'HR round',
  OFFER_APPROVAL: 'Offer approval',
  OFFER_SENT: 'Offer sent',
  OFFER_ACCEPTED: 'Offer accepted',
  JOINED: 'Joined',
};

const STAGE_COLORS = ['#F59E0B', '#8B5CF6', '#3B82F6', '#2F6D5C', '#F43F5E', '#14B8A6', '#6366F1', '#D97706', '#16A34A', '#0EA5E9'];

export default function RecruitmentPage() {
  const { data: stats } = useQuery({
    queryKey: ['recruitment', 'stats'],
    queryFn: () => api.get('/recruitment/stats').then((r) => r.data),
  });
  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['recruitment', 'pipeline'],
    queryFn: () => api.get('/recruitment/pipeline').then((r) => r.data),
  });

  const stages: PipelineStage[] = (pipeline ?? []).filter(
    (s: PipelineStage) => s.stage !== 'JOINED' || s.count > 0,
  );

  return (
    <div>
      <PageHeader title="Recruitment" description="Hiring pipeline across all open positions" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open positions" value={stats?.openJobs ?? '—'} icon={Briefcase} />
        <StatCard label="Total candidates" value={stats?.totalCandidates ?? '—'} icon={Users} />
        <StatCard label="Interviews this week" value={stats?.interviewsThisWeek ?? '—'} icon={CalendarClock} />
        <StatCard label="Offers pending" value={stats?.offersPending ?? '—'} icon={FileSignature} />
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-96 w-64 shrink-0" />
          ))}
        </div>
      ) : (
        <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage, idx) => (
            <div key={stage.stage} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STAGE_COLORS[idx % STAGE_COLORS.length] }}
                  />
                  {STAGE_LABELS[stage.stage] ?? stage.stage}
                </span>
                <Badge variant="outline">{stage.count}</Badge>
              </div>
              <div className="space-y-2">
                {stage.candidates.map((c) => (
                  <Card key={c.id} className="p-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${c.firstName} ${c.lastName}`} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {c.firstName} {c.lastName}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted">{c.jobRequisition.title}</p>
                      </div>
                    </div>
                    {c.source && (
                      <p className="mt-2">
                        <Badge variant="outline" className="text-[10px]">
                          {c.source}
                        </Badge>
                      </p>
                    )}
                  </Card>
                ))}
                {stage.candidates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-ink-faint">
                    No candidates
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
