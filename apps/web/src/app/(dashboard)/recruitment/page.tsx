'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, ExternalLink, FileSignature, Star, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface InterviewRow {
  id: string;
  stage: string;
  scheduledAt?: string | null;
  rating?: number | null;
  result?: string | null;
  scorecard?: {
    recommendation?: string;
    weightedRating?: number;
    competencies?: Array<{ name: string; rating: number }>;
  };
  candidate: { firstName: string; lastName: string; currentStage: string };
  jobRequisition: { title: string };
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
  const { data: interviews } = useQuery({
    queryKey: ['recruitment', 'interviews'],
    queryFn: () => api.get('/recruitment/interviews').then((r) => r.data as InterviewRow[]),
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

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Public careers page</p>
              <p className="mt-1 text-sm text-ink-muted">
                Published roles are visible at the tenant career URL and flow into this pipeline.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open('/careers/demo-corp', '_blank', 'noreferrer')}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Interview scorecards</p>
              <p className="text-xs text-ink-muted">Structured competency ratings and hiring recommendations</p>
            </div>
            <Badge variant="outline">{interviews?.length ?? 0}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(interviews ?? []).slice(0, 4).map((interview) => (
              <div key={interview.id} className="rounded border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {interview.candidate.firstName} {interview.candidate.lastName}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{interview.jobRequisition.title}</p>
                  </div>
                  <Badge variant={interview.result === 'PASS' ? 'success' : interview.result === 'FAIL' ? 'destructive' : 'outline'}>
                    {interview.scorecard?.recommendation ?? interview.result ?? 'Pending'}
                  </Badge>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                  <Star className="h-3.5 w-3.5" />
                  {interview.scorecard?.weightedRating ?? interview.rating ?? '—'} / 5 · {interview.stage}
                </p>
              </div>
            ))}
            {!(interviews ?? []).length && (
              <p className="text-sm text-ink-muted">No interviews scheduled yet.</p>
            )}
          </div>
        </Card>
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
