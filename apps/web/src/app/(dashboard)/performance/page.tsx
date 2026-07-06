'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ClipboardCheck, Star, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { OpsTextarea } from '@/components/forms/ops-textarea';

const tabs = ['Goals', 'Reviews', 'Feedback', 'Check-ins', 'Calibration'] as const;
type Tab = typeof tabs[number];
type Option = { id: string; name?: string; firstName?: string; lastName?: string };

interface GoalRow {
  id: string;
  title: string;
  type: string;
  progress: number;
  status: string;
  keyResults?: Array<{ title: string; current?: number; target?: number; unit?: string; status?: string }>;
  employee: { id: string; firstName: string; lastName: string };
}

interface ReviewCycleRow {
  id: string;
  name: string;
  status: string;
  completionPct: number;
  questions?: Array<{ id: string; label: string; type?: string; competency?: string; required?: boolean }>;
}

interface FeedbackRow {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  giver: { firstName: string; lastName: string };
  recipient: { firstName: string; lastName: string };
}

const employeeName = (employee?: Option | { firstName?: string; lastName?: string; name?: string }) =>
  `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim() || employee?.name || 'Employee';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function PerformancePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Goals');
  const [error, setError] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState({ employeeId: '', title: '', type: 'INDIVIDUAL', weightage: '1', krTitle: '', krCurrent: '0', krTarget: '100' });
  const [cycleForm, setCycleForm] = useState({ name: 'FY 2026 Quarterly Review', startDate: today(), endDate: inDays(30), status: 'ACTIVE' });
  const [reviewForm, setReviewForm] = useState({ reviewCycleId: '', revieweeId: '', reviewerType: 'SELF', overallRating: '4', comments: '' });
  const [feedbackForm, setFeedbackForm] = useState({ recipientId: '', type: 'FEEDBACK', message: '', isPublic: 'false' });
  const [checkInForm, setCheckInForm] = useState({ employeeId: '', goalId: '', progress: '50', status: 'ON_TRACK', notes: '', blockers: '', nextSteps: '' });
  const [oneOnOneForm, setOneOnOneForm] = useState({ employeeId: '', managerId: '', scheduledAt: inDays(3), agenda: 'Goal progress, Feedback, Career growth' });
  const [frameworkForm, setFrameworkForm] = useState({ name: 'Delivery and Leadership Framework', description: 'Shared competencies for review cycles.' });
  const [calibrationForm, setCalibrationForm] = useState({ reviewCycleId: '', revieweeId: '', previousRating: '4', calibratedRating: '4.5', performanceBand: 'HIGH_PERFORMER', potential: 'HIGH', promotionRecommendation: '', pipRecommendation: 'false', reason: '' });
  const [pipForm, setPipForm] = useState({ employeeId: '', reviewCycleId: '', title: '', reason: '', startDate: today(), endDate: inDays(60), successCriteria: 'Weekly progress updates; No uncommunicated deadline slips' });

  const { data: stats } = useQuery({ queryKey: ['performance', 'stats'], queryFn: () => api.get('/performance/stats').then((r) => r.data) });
  const { data: goals } = useQuery({ queryKey: ['performance', 'goals'], queryFn: () => api.get('/performance/goals').then((r) => r.data as GoalRow[]) });
  const { data: feedback } = useQuery({ queryKey: ['performance', 'feedback'], queryFn: () => api.get('/performance/feedback').then((r) => r.data as FeedbackRow[]) });
  const { data: cycles } = useQuery({ queryKey: ['performance', 'cycles'], queryFn: () => api.get('/performance/cycles').then((r) => r.data as ReviewCycleRow[]) });
  const { data: checkIns } = useQuery({ queryKey: ['performance', 'check-ins'], queryFn: () => api.get('/performance/check-ins').then((r) => r.data) });
  const { data: oneOnOnes } = useQuery({ queryKey: ['performance', 'one-on-ones'], queryFn: () => api.get('/performance/one-on-ones').then((r) => r.data) });
  const { data: frameworks } = useQuery({ queryKey: ['performance', 'frameworks'], queryFn: () => api.get('/performance/frameworks').then((r) => r.data) });
  const { data: calibrations } = useQuery({ queryKey: ['performance', 'calibrations'], queryFn: () => api.get('/performance/calibrations').then((r) => r.data) });
  const { data: pips } = useQuery({ queryKey: ['performance', 'pips'], queryFn: () => api.get('/performance/pips').then((r) => r.data) });
  const { data: promotions } = useQuery({ queryKey: ['performance', 'promotions'], queryFn: () => api.get('/performance/promotions').then((r) => r.data) });
  const { data: options } = useQuery({
    queryKey: ['employees', 'meta-options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as { managers: Option[] }),
  });

  const employees = options?.managers ?? [];
  const activeCycle = useMemo(() => (cycles ?? []).find((cycle) => cycle.status === 'ACTIVE') ?? cycles?.[0], [cycles]);
  const { data: completion } = useQuery({
    queryKey: ['performance', 'completion', activeCycle?.id],
    enabled: !!activeCycle?.id,
    queryFn: () => api.get(`/performance/cycles/${activeCycle?.id}/completion`).then((r) => r.data),
  });
  const { data: distribution } = useQuery({
    queryKey: ['performance', 'distribution', activeCycle?.id],
    enabled: !!activeCycle?.id,
    queryFn: () => api.get(`/performance/cycles/${activeCycle?.id}/distribution`).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['performance'] });
  const onError = (err: unknown) => setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Action failed');
  const mutation = (fn: () => Promise<unknown>, after?: () => void) =>
    useMutation({ mutationFn: fn, onSuccess: () => { setError(null); after?.(); invalidate(); }, onError });

  const createGoal = mutation(() =>
    api.post('/performance/goals', {
      employeeId: goalForm.employeeId,
      title: goalForm.title,
      type: goalForm.type,
      weightage: Number(goalForm.weightage),
      keyResults: goalForm.krTitle ? [{ title: goalForm.krTitle, current: Number(goalForm.krCurrent), target: Number(goalForm.krTarget), unit: '%', weight: 1 }] : [],
    }),
    () => setGoalForm((f) => ({ ...f, title: '', krTitle: '' })),
  );
  const createCycle = mutation(() => api.post('/performance/cycles', cycleForm));
  const submitReview = mutation(() => api.post('/performance/reviews', { ...reviewForm, reviewCycleId: reviewForm.reviewCycleId || activeCycle?.id, overallRating: Number(reviewForm.overallRating), responses: { summary: reviewForm.comments } }), () => setReviewForm((f) => ({ ...f, comments: '' })));
  const giveFeedback = mutation(() => api.post('/performance/feedback', { ...feedbackForm, isPublic: feedbackForm.isPublic === 'true' }), () => setFeedbackForm((f) => ({ ...f, message: '' })));
  const createCheckIn = mutation(() => api.post('/performance/check-ins', { ...checkInForm, progress: Number(checkInForm.progress), goalId: checkInForm.goalId || undefined }), () => setCheckInForm((f) => ({ ...f, notes: '', blockers: '', nextSteps: '' })));
  const createOneOnOne = mutation(() => api.post('/performance/one-on-ones', { ...oneOnOneForm, scheduledAt: new Date(oneOnOneForm.scheduledAt).toISOString(), agenda: oneOnOneForm.agenda.split(',').map((item) => item.trim()).filter(Boolean) }));
  const createFramework = mutation(() => api.post('/performance/frameworks', frameworkForm));
  const calibrate = mutation(() => api.post('/performance/calibrations', { ...calibrationForm, reviewCycleId: calibrationForm.reviewCycleId || activeCycle?.id, previousRating: Number(calibrationForm.previousRating), calibratedRating: Number(calibrationForm.calibratedRating), pipRecommendation: calibrationForm.pipRecommendation === 'true' }), () => setCalibrationForm((f) => ({ ...f, reason: '' })));
  const createPip = mutation(() => api.post('/performance/pips', { ...pipForm, reviewCycleId: pipForm.reviewCycleId || undefined, successCriteria: pipForm.successCriteria.split(';').map((item) => ({ item: item.trim() })).filter((item) => item.item) }), () => setPipForm((f) => ({ ...f, title: '', reason: '' })));

  const submit = (event: FormEvent, run: () => void) => {
    event.preventDefault();
    run();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Talent"
        title="Performance"
        description="Goals, OKRs, reviews, check-ins, calibration and improvement plans"
        meta={
          <>
            <Badge variant="outline">{stats?.goals?.active ?? 0} active goals</Badge>
            <Badge variant="outline">{stats?.avgRating ?? '-'} avg rating</Badge>
            <Badge variant="outline">{stats?.activePips ?? 0} active PIPs</Badge>
          </>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Active goals" value={stats?.goals?.active ?? '-'} icon={Target} />
        <StatCard label="Completed" value={stats?.goals?.completed ?? '-'} />
        <StatCard label="At risk" value={stats?.goals?.atRisk ?? '-'} />
        <StatCard label="Avg rating" value={stats?.avgRating ?? '-'} icon={Star} />
        <StatCard label="Check-ins" value={stats?.checkIns ?? '-'} icon={Activity} />
        <StatCard label="Active PIPs" value={stats?.activePips ?? '-'} icon={ClipboardCheck} />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button key={tab} variant={activeTab === tab ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'Goals' && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader><CardTitle>Create goal / OKR</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => createGoal.mutate())}>
                <Select value={goalForm.employeeId} onChange={(e) => setGoalForm((f) => ({ ...f, employeeId: e.target.value }))} required>
                  <option value="">Employee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}
                </Select>
                <Input placeholder="Goal title" value={goalForm.title} onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))} required />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={goalForm.type} onChange={(e) => setGoalForm((f) => ({ ...f, type: e.target.value }))}>
                    <option>INDIVIDUAL</option><option>TEAM</option><option>COMPANY</option>
                  </Select>
                  <Input type="number" min="0" step="0.5" value={goalForm.weightage} onChange={(e) => setGoalForm((f) => ({ ...f, weightage: e.target.value }))} />
                </div>
                <Input placeholder="Key result" value={goalForm.krTitle} onChange={(e) => setGoalForm((f) => ({ ...f, krTitle: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Current" value={goalForm.krCurrent} onChange={(e) => setGoalForm((f) => ({ ...f, krCurrent: e.target.value }))} />
                  <Input type="number" placeholder="Target" value={goalForm.krTarget} onChange={(e) => setGoalForm((f) => ({ ...f, krTarget: e.target.value }))} />
                </div>
                <Button className="w-full" disabled={createGoal.isPending}>Create goal</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Goal alignment and progress</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(goals ?? []).slice(0, 12).map((g) => (
                <div key={g.id} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{g.title}</p>
                    <Badge variant={statusVariant(g.status)}>{g.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <div className="flex items-center gap-3"><Progress value={g.progress} className="flex-1" /><span className="w-10 text-right text-xs text-ink-muted">{g.progress}%</span></div>
                  <p className="mt-1 text-xs text-ink-muted">{g.employee.firstName} {g.employee.lastName} · {g.type}</p>
                  {!!g.keyResults?.length && <div className="mt-2 grid gap-1 text-xs">{g.keyResults.slice(0, 3).map((kr) => <span key={kr.title} className="rounded bg-canvas px-2 py-1">{kr.title}: {kr.current ?? 0}/{kr.target ?? 100}{kr.unit ?? ''}</span>)}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Reviews' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Launch review cycle</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => createCycle.mutate())}>
                <Input value={cycleForm.name} onChange={(e) => setCycleForm((f) => ({ ...f, name: e.target.value }))} required />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm((f) => ({ ...f, startDate: e.target.value }))} required />
                  <Input type="date" value={cycleForm.endDate} onChange={(e) => setCycleForm((f) => ({ ...f, endDate: e.target.value }))} required />
                </div>
                <Select value={cycleForm.status} onChange={(e) => setCycleForm((f) => ({ ...f, status: e.target.value }))}><option>DRAFT</option><option>ACTIVE</option><option>COMPLETED</option></Select>
                <Button className="w-full" disabled={createCycle.isPending}>Launch cycle</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Submit review</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => submitReview.mutate())}>
                <Select value={reviewForm.reviewCycleId || activeCycle?.id || ''} onChange={(e) => setReviewForm((f) => ({ ...f, reviewCycleId: e.target.value }))} required>
                  <option value="">Cycle</option>
                  {(cycles ?? []).map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
                </Select>
                <Select value={reviewForm.revieweeId} onChange={(e) => setReviewForm((f) => ({ ...f, revieweeId: e.target.value }))} required>
                  <option value="">Reviewee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={reviewForm.reviewerType} onChange={(e) => setReviewForm((f) => ({ ...f, reviewerType: e.target.value }))}><option>SELF</option><option>MANAGER</option><option>PEER</option><option>SKIP_LEVEL</option></Select>
                  <Input type="number" min="1" max="5" step="0.5" value={reviewForm.overallRating} onChange={(e) => setReviewForm((f) => ({ ...f, overallRating: e.target.value }))} />
                </div>
                <OpsTextarea placeholder="Review comments" value={reviewForm.comments} onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))} />
                <Button className="w-full" disabled={submitReview.isPending}>Submit review</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Completion and distribution</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(cycles ?? []).slice(0, 4).map((cycle) => (
                <div key={cycle.id} className="rounded border border-line p-3">
                  <div className="flex items-center justify-between"><p className="text-sm font-medium">{cycle.name}</p><Badge variant={cycle.status === 'ACTIVE' ? 'success' : 'outline'}>{cycle.status}</Badge></div>
                  <Progress className="mt-2" value={cycle.completionPct} />
                  <p className="mt-1 text-xs text-ink-muted">{cycle.completionPct}% complete</p>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {(distribution?.buckets ?? []).map((bucket: { rating: number; count: number }) => (
                  <span key={bucket.rating} className="rounded bg-canvas p-2"><b className="block text-ink">{bucket.count}</b>{bucket.rating} star</span>
                ))}
              </div>
              <p className="text-xs text-ink-muted">{completion?.employees?.filter((row: { completionPct: number }) => row.completionPct === 100).length ?? 0} employees fully completed for the active cycle.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Feedback' && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader><CardTitle>Give feedback or praise</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => giveFeedback.mutate())}>
                <Select value={feedbackForm.recipientId} onChange={(e) => setFeedbackForm((f) => ({ ...f, recipientId: e.target.value }))} required><option value="">Recipient</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select>
                <div className="grid grid-cols-2 gap-2"><Select value={feedbackForm.type} onChange={(e) => setFeedbackForm((f) => ({ ...f, type: e.target.value }))}><option>FEEDBACK</option><option>PRAISE</option></Select><Select value={feedbackForm.isPublic} onChange={(e) => setFeedbackForm((f) => ({ ...f, isPublic: e.target.value }))}><option value="false">Private</option><option value="true">Public</option></Select></div>
                <OpsTextarea placeholder="Specific, actionable message" value={feedbackForm.message} onChange={(e) => setFeedbackForm((f) => ({ ...f, message: e.target.value }))} required />
                <Button className="w-full" disabled={giveFeedback.isPending}>Send feedback</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Continuous feedback</CardTitle></CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {(feedback ?? []).slice(0, 10).map((f) => <div key={f.id} className="flex gap-3 rounded border border-line p-3"><Avatar name={`${f.giver.firstName} ${f.giver.lastName}`} size="sm" /><div className="min-w-0"><p className="text-sm font-medium">{f.giver.firstName} {f.giver.lastName} to {f.recipient.firstName} {f.recipient.lastName}</p><p className="text-sm text-ink-muted">{f.message}</p><p className="mt-1 text-[11px] text-ink-faint">{f.type} · {formatDate(f.createdAt)}</p></div></div>)}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Check-ins' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Goal check-in</CardTitle></CardHeader>
            <CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => createCheckIn.mutate())}>
              <Select value={checkInForm.employeeId} onChange={(e) => setCheckInForm((f) => ({ ...f, employeeId: e.target.value }))} required><option value="">Employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select>
              <Select value={checkInForm.goalId} onChange={(e) => setCheckInForm((f) => ({ ...f, goalId: e.target.value }))}><option value="">Optional goal</option>{(goals ?? []).filter((goal) => !checkInForm.employeeId || goal.employee.id === checkInForm.employeeId).map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</Select>
              <div className="grid grid-cols-2 gap-2"><Input type="number" min="0" max="100" value={checkInForm.progress} onChange={(e) => setCheckInForm((f) => ({ ...f, progress: e.target.value }))} /><Select value={checkInForm.status} onChange={(e) => setCheckInForm((f) => ({ ...f, status: e.target.value }))}><option>ON_TRACK</option><option>AT_RISK</option><option>BLOCKED</option><option>COMPLETE</option></Select></div>
              <OpsTextarea placeholder="Notes" value={checkInForm.notes} onChange={(e) => setCheckInForm((f) => ({ ...f, notes: e.target.value }))} />
              <Input placeholder="Blockers" value={checkInForm.blockers} onChange={(e) => setCheckInForm((f) => ({ ...f, blockers: e.target.value }))} />
              <Input placeholder="Next steps" value={checkInForm.nextSteps} onChange={(e) => setCheckInForm((f) => ({ ...f, nextSteps: e.target.value }))} />
              <Button className="w-full" disabled={createCheckIn.isPending}>Save check-in</Button>
            </form></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>One-on-ones</CardTitle></CardHeader>
            <CardContent className="space-y-4"><form className="grid gap-2" onSubmit={(e) => submit(e, () => createOneOnOne.mutate())}>
              <div className="grid grid-cols-2 gap-2"><Select value={oneOnOneForm.employeeId} onChange={(e) => setOneOnOneForm((f) => ({ ...f, employeeId: e.target.value }))} required><option value="">Employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select><Select value={oneOnOneForm.managerId} onChange={(e) => setOneOnOneForm((f) => ({ ...f, managerId: e.target.value }))} required><option value="">Manager</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select></div>
              <Input type="date" value={oneOnOneForm.scheduledAt} onChange={(e) => setOneOnOneForm((f) => ({ ...f, scheduledAt: e.target.value }))} required />
              <Input value={oneOnOneForm.agenda} onChange={(e) => setOneOnOneForm((f) => ({ ...f, agenda: e.target.value }))} />
              <Button disabled={createOneOnOne.isPending}>Schedule 1:1</Button>
            </form>
            <div className="space-y-2">{(oneOnOnes ?? []).slice(0, 6).map((row: { id: string; status: string; scheduledAt: string; employee: Option; manager: Option }) => <div key={row.id} className="rounded border border-line p-3 text-sm"><div className="flex justify-between"><b>{employeeName(row.employee)}</b><Badge variant={row.status === 'COMPLETED' ? 'success' : 'outline'}>{row.status}</Badge></div><p className="text-xs text-ink-muted">with {employeeName(row.manager)} · {formatDate(row.scheduledAt)}</p></div>)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Calibration' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card><CardHeader><CardTitle>Competency framework</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => createFramework.mutate())}><Input value={frameworkForm.name} onChange={(e) => setFrameworkForm((f) => ({ ...f, name: e.target.value }))} /><OpsTextarea value={frameworkForm.description} onChange={(e) => setFrameworkForm((f) => ({ ...f, description: e.target.value }))} /><Button className="w-full">Save framework</Button></form><div className="mt-3 space-y-2">{(frameworks ?? []).slice(0, 3).map((row: { id: string; name: string; isActive: boolean }) => <div className="rounded border border-line p-2 text-sm" key={row.id}>{row.name} {row.isActive && <Badge variant="success">Active</Badge>}</div>)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Calibration</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => calibrate.mutate())}><Select value={calibrationForm.reviewCycleId || activeCycle?.id || ''} onChange={(e) => setCalibrationForm((f) => ({ ...f, reviewCycleId: e.target.value }))} required><option value="">Cycle</option>{(cycles ?? []).map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</Select><Select value={calibrationForm.revieweeId} onChange={(e) => setCalibrationForm((f) => ({ ...f, revieweeId: e.target.value }))} required><option value="">Employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select><div className="grid grid-cols-2 gap-2"><Input type="number" step="0.5" value={calibrationForm.previousRating} onChange={(e) => setCalibrationForm((f) => ({ ...f, previousRating: e.target.value }))} /><Input type="number" step="0.5" value={calibrationForm.calibratedRating} onChange={(e) => setCalibrationForm((f) => ({ ...f, calibratedRating: e.target.value }))} /></div><Input placeholder="Performance band" value={calibrationForm.performanceBand} onChange={(e) => setCalibrationForm((f) => ({ ...f, performanceBand: e.target.value }))} /><Input placeholder="Promotion recommendation" value={calibrationForm.promotionRecommendation} onChange={(e) => setCalibrationForm((f) => ({ ...f, promotionRecommendation: e.target.value }))} /><OpsTextarea placeholder="Reason for audit log" value={calibrationForm.reason} onChange={(e) => setCalibrationForm((f) => ({ ...f, reason: e.target.value }))} required /><Button className="w-full">Calibrate rating</Button></form></CardContent></Card>
          <Card><CardHeader><CardTitle>PIP / promotion</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => createPip.mutate())}><Select value={pipForm.employeeId} onChange={(e) => setPipForm((f) => ({ ...f, employeeId: e.target.value }))} required><option value="">Employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select><Input placeholder="PIP title" value={pipForm.title} onChange={(e) => setPipForm((f) => ({ ...f, title: e.target.value }))} required /><OpsTextarea placeholder="Reason" value={pipForm.reason} onChange={(e) => setPipForm((f) => ({ ...f, reason: e.target.value }))} required /><div className="grid grid-cols-2 gap-2"><Input type="date" value={pipForm.startDate} onChange={(e) => setPipForm((f) => ({ ...f, startDate: e.target.value }))} /><Input type="date" value={pipForm.endDate} onChange={(e) => setPipForm((f) => ({ ...f, endDate: e.target.value }))} /></div><Button className="w-full">Create PIP</Button></form></CardContent></Card>
          <Card className="xl:col-span-3"><CardHeader><CardTitle>Calibration, PIP and promotion records</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{(calibrations ?? []).slice(0, 4).map((row: { id: string; calibratedRating: number; performanceBand?: string; reviewee: { firstName: string; lastName: string } }) => <div key={row.id} className="rounded border border-line p-3"><p className="font-medium">{row.reviewee.firstName} {row.reviewee.lastName}</p><p className="text-sm text-ink-muted">Calibrated {row.calibratedRating} · {row.performanceBand ?? 'No band'}</p></div>)}{(pips ?? []).slice(0, 4).map((row: { id: string; title: string; status: string; employee: { firstName: string; lastName: string } }) => <div key={row.id} className="rounded border border-line p-3"><p className="font-medium">{row.title}</p><p className="text-sm text-ink-muted">{row.employee.firstName} {row.employee.lastName} · {row.status}</p></div>)}{(promotions ?? []).slice(0, 4).map((row: { id: string; recommendedRole: string; status: string; employee: { firstName: string; lastName: string } }) => <div key={row.id} className="rounded border border-line p-3"><p className="font-medium">{row.recommendedRole}</p><p className="text-sm text-ink-muted">{row.employee.firstName} {row.employee.lastName} · {row.status}</p></div>)}</CardContent></Card>
        </div>
      )}
    </div>
  );
}
