'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, BarChart3, CalendarDays, HeartHandshake, Megaphone, MessageCircle, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { OpsTextarea } from '@/components/forms/ops-textarea';

const tabs = ['Feed', 'Surveys', 'Recognition', 'Culture'] as const;
type Tab = typeof tabs[number];
type Option = { id: string; name?: string; firstName?: string; lastName?: string };

interface SurveyQuestion {
  id: string;
  text: string;
  type: 'SCALE' | 'TEXT' | 'CHOICE';
  options?: string[];
}

interface SurveyRow {
  id: string;
  title: string;
  type: string;
  status: string;
  questions: SurveyQuestion[];
  _count: { responses: number };
}

interface FeedItem {
  id: string;
  type: 'ANNOUNCEMENT' | 'RECOGNITION' | 'POLL';
  title: string;
  body: string;
  badge?: string | null;
  points?: number;
  from?: string;
  responses?: number;
  audience?: string;
  createdAt: string;
}

interface RecognitionRow {
  id: string;
  badge: string | null;
  message: string;
  points: number;
  createdAt: string;
  giver: { firstName: string; lastName: string };
  recipient: { firstName: string; lastName: string; designation: { name: string } | null };
}

interface AnalyticsRow {
  id: string;
  title: string;
  type: string;
  status: string;
  responses: number;
  participationRate: number;
  avgScaleScore: number | null;
  enps: number | null;
}

interface LeaderboardRow {
  employeeId: string;
  employee: string;
  department: string | null;
  recognitions: number;
  points: number;
}

const employeeName = (employee?: Option | { firstName?: string; lastName?: string; name?: string }) =>
  `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim() || employee?.name || 'Employee';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function EngagementPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Feed');
  const [error, setError] = useState<string | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '', audience: 'ALL', expiresAt: '' });
  const [surveyForm, setSurveyForm] = useState({ title: 'Monthly pulse survey', type: 'PULSE', status: 'ACTIVE', isAnonymous: 'true', endDate: inDays(14), question: 'How engaged do you feel this week?' });
  const [pollForm, setPollForm] = useState({ title: 'Team preference poll', question: 'Which initiative should we prioritize?', options: 'Manager 1:1s, Team offsite, Learning budget', endDate: inDays(7) });
  const [responseForm, setResponseForm] = useState({ surveyId: '', scale: '8', text: '', choice: '' });
  const [recognitionForm, setRecognitionForm] = useState({ recipientId: '', badge: 'OWNERSHIP', message: '', points: '20' });
  const [anonymousForm, setAnonymousForm] = useState({ category: 'CULTURE', sentiment: 'CONSTRUCTIVE', message: '' });
  const [segmentBy, setSegmentBy] = useState('department');

  const { data: stats } = useQuery({ queryKey: ['engagement', 'stats'], queryFn: () => api.get('/engagement/stats').then((r) => r.data) });
  const { data: feed } = useQuery({ queryKey: ['engagement', 'feed'], queryFn: () => api.get('/engagement/feed').then((r) => r.data as FeedItem[]) });
  const { data: surveys } = useQuery({ queryKey: ['engagement', 'surveys'], queryFn: () => api.get('/engagement/surveys').then((r) => r.data as SurveyRow[]) });
  const { data: analytics } = useQuery({ queryKey: ['engagement', 'survey-analytics'], queryFn: () => api.get('/engagement/surveys/analytics').then((r) => r.data as AnalyticsRow[]) });
  const { data: recognitions } = useQuery({ queryKey: ['engagement', 'recognitions'], queryFn: () => api.get('/engagement/recognitions').then((r) => r.data) });
  const { data: rewards } = useQuery({ queryKey: ['engagement', 'rewards'], queryFn: () => api.get('/engagement/rewards/leaderboard').then((r) => r.data) });
  const { data: milestones } = useQuery({ queryKey: ['engagement', 'milestones'], queryFn: () => api.get('/engagement/milestones').then((r) => r.data) });
  const { data: anonymousFeedback } = useQuery({ queryKey: ['engagement', 'anonymous-feedback'], queryFn: () => api.get('/engagement/anonymous-feedback').then((r) => r.data) });
  const { data: options } = useQuery({
    queryKey: ['employees', 'meta-options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as { managers: Option[] }),
  });

  const employees = options?.managers ?? [];
  const selectedSurvey = useMemo(
    () => (surveys ?? []).find((survey) => survey.id === responseForm.surveyId) ?? (surveys ?? []).find((survey) => survey.status === 'ACTIVE'),
    [responseForm.surveyId, surveys],
  );
  const { data: segments } = useQuery({
    queryKey: ['engagement', 'segments', selectedSurvey?.id, segmentBy],
    enabled: !!selectedSurvey?.id,
    queryFn: () => api.get(`/engagement/surveys/${selectedSurvey?.id}/segments?by=${segmentBy}`).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['engagement'] });
  const onError = (err: unknown) => setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Action failed');
  const mutation = (fn: () => Promise<unknown>, after?: () => void) =>
    useMutation({ mutationFn: fn, onSuccess: () => { setError(null); after?.(); invalidate(); }, onError });

  const createAnnouncement = mutation(() => api.post('/engagement/announcements', { ...announcementForm, expiresAt: announcementForm.expiresAt || undefined }), () => setAnnouncementForm((f) => ({ ...f, title: '', body: '' })));
  const createSurvey = mutation(() => api.post('/engagement/surveys', {
    title: surveyForm.title,
    type: surveyForm.type,
    status: surveyForm.status,
    isAnonymous: surveyForm.isAnonymous === 'true',
    endDate: surveyForm.endDate,
    questions: surveyForm.type === 'ENPS'
      ? [{ id: 'enps', text: 'How likely are you to recommend this company as a workplace?', type: 'SCALE' }]
      : [{ id: 'engagement', text: surveyForm.question, type: 'SCALE' }, { id: 'comment', text: 'What should we improve?', type: 'TEXT' }],
  }));
  const createPoll = mutation(() => api.post('/engagement/polls', { ...pollForm, options: pollForm.options.split(',').map((option) => option.trim()).filter(Boolean) }));
  const respond = mutation(() => {
    const survey = selectedSurvey;
    const questions = survey?.questions ?? [];
    const responses: Record<string, string | number> = {};
    for (const question of questions) {
      if (question.type === 'SCALE') responses[question.id] = Number(responseForm.scale);
      if (question.type === 'TEXT') responses[question.id] = responseForm.text;
      if (question.type === 'CHOICE') responses[question.id] = responseForm.choice || question.options?.[0] || '';
    }
    return api.post(`/engagement/surveys/${survey?.id}/respond`, { responses });
  }, () => setResponseForm((f) => ({ ...f, text: '' })));
  const recognize = mutation(() => api.post('/engagement/recognitions', { ...recognitionForm, points: Number(recognitionForm.points) }), () => setRecognitionForm((f) => ({ ...f, message: '' })));
  const submitAnonymous = mutation(() => api.post('/engagement/anonymous-feedback', anonymousForm), () => setAnonymousForm((f) => ({ ...f, message: '' })));

  const submit = (event: FormEvent, run: () => void) => {
    event.preventDefault();
    run();
  };

  return (
    <div>
      <PageHeader title="Engagement" description="Announcements, surveys, polls, recognition, anonymous feedback and culture milestones" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Engagement score" value={stats?.engagementScore ?? '-'} icon={HeartHandshake} />
        <StatCard label="Participation" value={stats?.participationRate != null ? `${stats.participationRate}%` : '-'} icon={Megaphone} />
        <StatCard label="Recognitions" value={stats?.recognitionsThisMonth ?? '-'} icon={Award} />
        <StatCard label="Reward points" value={stats?.pointsThisMonth ?? '-'} icon={Trophy} />
        <StatCard label="Active polls" value={stats?.activePolls ?? '-'} icon={BarChart3} />
        <StatCard label="Feedback" value={anonymousFeedback?.length ?? '-'} icon={MessageCircle} />
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => <Button key={tab} size="sm" variant={activeTab === tab ? 'default' : 'outline'} onClick={() => setActiveTab(tab)}>{tab}</Button>)}
      </div>

      {activeTab === 'Feed' && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader><CardTitle>Publish announcement</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => createAnnouncement.mutate())}>
                <Input placeholder="Title" value={announcementForm.title} onChange={(e) => setAnnouncementForm((f) => ({ ...f, title: e.target.value }))} required />
                <OpsTextarea placeholder="Announcement body" value={announcementForm.body} onChange={(e) => setAnnouncementForm((f) => ({ ...f, body: e.target.value }))} required />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={announcementForm.audience} onChange={(e) => setAnnouncementForm((f) => ({ ...f, audience: e.target.value }))}><option>ALL</option><option>EMPLOYEES</option><option>MANAGERS</option><option>HR</option></Select>
                  <Input type="date" value={announcementForm.expiresAt} onChange={(e) => setAnnouncementForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                </div>
                <Button className="w-full" disabled={createAnnouncement.isPending}>Publish</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Company feed</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(feed ?? []).slice(0, 12).map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex gap-3 rounded-lg border border-line p-3">
                  <Avatar name={item.title} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant={item.type === 'ANNOUNCEMENT' ? 'info' : item.type === 'POLL' ? 'violet' : 'warning'}>{item.type}</Badge>{item.points != null && <Badge variant="success">+{item.points} pts</Badge>}</div>
                    <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">{item.from ? `from ${item.from} · ` : ''}{item.responses != null ? `${item.responses} responses · ` : ''}{item.audience ? `${item.audience} · ` : ''}{formatDate(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Surveys' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Launch pulse / eNPS survey</CardTitle></CardHeader>
            <CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => createSurvey.mutate())}>
              <Input value={surveyForm.title} onChange={(e) => setSurveyForm((f) => ({ ...f, title: e.target.value }))} required />
              <div className="grid grid-cols-2 gap-2"><Select value={surveyForm.type} onChange={(e) => setSurveyForm((f) => ({ ...f, type: e.target.value }))}><option>PULSE</option><option>ENPS</option><option>CUSTOM</option></Select><Select value={surveyForm.isAnonymous} onChange={(e) => setSurveyForm((f) => ({ ...f, isAnonymous: e.target.value }))}><option value="true">Anonymous</option><option value="false">Identified</option></Select></div>
              <Input placeholder="Scale question" value={surveyForm.question} onChange={(e) => setSurveyForm((f) => ({ ...f, question: e.target.value }))} />
              <Input type="date" value={surveyForm.endDate} onChange={(e) => setSurveyForm((f) => ({ ...f, endDate: e.target.value }))} />
              <Button className="w-full" disabled={createSurvey.isPending}>Launch survey</Button>
            </form></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Create poll</CardTitle></CardHeader>
            <CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => createPoll.mutate())}>
              <Input value={pollForm.title} onChange={(e) => setPollForm((f) => ({ ...f, title: e.target.value }))} required />
              <Input value={pollForm.question} onChange={(e) => setPollForm((f) => ({ ...f, question: e.target.value }))} required />
              <Input value={pollForm.options} onChange={(e) => setPollForm((f) => ({ ...f, options: e.target.value }))} required />
              <Input type="date" value={pollForm.endDate} onChange={(e) => setPollForm((f) => ({ ...f, endDate: e.target.value }))} />
              <Button className="w-full" disabled={createPoll.isPending}>Create poll</Button>
            </form></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Respond as employee</CardTitle></CardHeader>
            <CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => respond.mutate())}>
              <Select value={responseForm.surveyId || selectedSurvey?.id || ''} onChange={(e) => setResponseForm((f) => ({ ...f, surveyId: e.target.value }))} required><option value="">Survey or poll</option>{(surveys ?? []).filter((survey) => survey.status === 'ACTIVE').map((survey) => <option key={survey.id} value={survey.id}>{survey.title}</option>)}</Select>
              <Input type="number" min="0" max="10" value={responseForm.scale} onChange={(e) => setResponseForm((f) => ({ ...f, scale: e.target.value }))} />
              {selectedSurvey?.questions?.some((q) => q.type === 'CHOICE') && <Select value={responseForm.choice} onChange={(e) => setResponseForm((f) => ({ ...f, choice: e.target.value }))}>{selectedSurvey.questions.find((q) => q.type === 'CHOICE')?.options?.map((option) => <option key={option}>{option}</option>)}</Select>}
              <OpsTextarea placeholder="Optional comment" value={responseForm.text} onChange={(e) => setResponseForm((f) => ({ ...f, text: e.target.value }))} />
              <Button className="w-full" disabled={respond.isPending || !selectedSurvey}>Submit response</Button>
            </form></CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Survey analytics and segmentation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2"><Select className="w-44" value={segmentBy} onChange={(e) => setSegmentBy(e.target.value)}><option value="department">Department</option><option value="location">Location</option><option value="tenure">Tenure</option><option value="manager">Manager</option></Select><Badge variant="outline">Minimum {segments?.minResponses ?? 3} responses per segment</Badge></div>
              <div className="grid gap-3 md:grid-cols-2">{(segments?.segments ?? []).map((segment: { segment: string; responses: number; suppressed: boolean; avgScaleScore?: number; enps?: number }) => <div key={segment.segment} className="rounded border border-line p-3"><div className="flex justify-between"><p className="font-medium">{segment.segment}</p><Badge variant={segment.suppressed ? 'warning' : 'success'}>{segment.responses} responses</Badge></div><p className="mt-1 text-sm text-ink-muted">{segment.suppressed ? 'Suppressed for anonymity' : `Avg ${segment.avgScaleScore ?? '-'} · eNPS ${segment.enps ?? '-'}`}</p></div>)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent surveys</CardTitle></CardHeader>
            <CardContent className="space-y-3">{(analytics ?? []).slice(0, 8).map((survey) => <div key={survey.id} className="rounded border border-line p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{survey.title}</p><Badge variant={survey.status === 'ACTIVE' ? 'success' : 'outline'}>{survey.status}</Badge></div><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded bg-canvas p-2"><b className="block text-ink">{survey.participationRate}%</b>Part.</span><span className="rounded bg-canvas p-2"><b className="block text-ink">{survey.avgScaleScore ?? '-'}</b>Avg</span><span className="rounded bg-canvas p-2"><b className="block text-ink">{survey.enps ?? '-'}</b>eNPS</span></div></div>)}</CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Recognition' && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader><CardTitle>Recognize a teammate</CardTitle></CardHeader>
            <CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => recognize.mutate())}>
              <Select value={recognitionForm.recipientId} onChange={(e) => setRecognitionForm((f) => ({ ...f, recipientId: e.target.value }))} required><option value="">Recipient</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</Select>
              <div className="grid grid-cols-2 gap-2"><Select value={recognitionForm.badge} onChange={(e) => setRecognitionForm((f) => ({ ...f, badge: e.target.value }))}><option>OWNERSHIP</option><option>TEAM_PLAYER</option><option>CUSTOMER_FIRST</option><option>INNOVATOR</option><option>MENTOR</option></Select><Input type="number" min="0" max="100" value={recognitionForm.points} onChange={(e) => setRecognitionForm((f) => ({ ...f, points: e.target.value }))} /></div>
              <OpsTextarea placeholder="Recognition message" value={recognitionForm.message} onChange={(e) => setRecognitionForm((f) => ({ ...f, message: e.target.value }))} required />
              <Button className="w-full" disabled={recognize.isPending}>Post recognition</Button>
            </form></CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Reward leaderboard</CardTitle></CardHeader><CardContent className="space-y-3">{(rewards?.monthly ?? []).map((row: LeaderboardRow, index: number) => <div key={row.employeeId} className="flex items-center justify-between rounded-lg border border-line p-3"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{index + 1}</span><div><p className="text-sm font-medium">{row.employee}</p><p className="text-xs text-ink-muted">{row.department ?? 'Team'} · {row.recognitions} recognitions</p></div></div><Badge variant="success">{row.points} pts</Badge></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle>Recognition wall</CardTitle></CardHeader><CardContent className="space-y-4">{(recognitions?.data ?? []).slice(0, 8).map((r: RecognitionRow) => <div key={r.id} className="flex gap-3"><Avatar name={`${r.recipient.firstName} ${r.recipient.lastName}`} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{r.recipient.firstName} {r.recipient.lastName}</span> {r.badge && <Badge variant="warning">{r.badge.replace(/_/g, ' ')}</Badge>} <Badge variant="success">+{r.points} pts</Badge></p><p className="mt-0.5 text-sm text-ink-muted">“{r.message}”</p><p className="mt-0.5 text-[11px] text-ink-faint">from {r.giver.firstName} {r.giver.lastName} · {formatDate(r.createdAt)}</p></div></div>)}</CardContent></Card>
          </div>
        </div>
      )}

      {activeTab === 'Culture' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Anonymous feedback</CardTitle></CardHeader>
            <CardContent><form className="space-y-3" onSubmit={(e) => submit(e, () => submitAnonymous.mutate())}><div className="grid grid-cols-2 gap-2"><Select value={anonymousForm.category} onChange={(e) => setAnonymousForm((f) => ({ ...f, category: e.target.value }))}><option>CULTURE</option><option>WORKPLACE</option><option>MANAGER</option><option>POLICY</option></Select><Select value={anonymousForm.sentiment} onChange={(e) => setAnonymousForm((f) => ({ ...f, sentiment: e.target.value }))}><option>POSITIVE</option><option>CONSTRUCTIVE</option><option>RISK</option></Select></div><OpsTextarea placeholder="Anonymous message" value={anonymousForm.message} onChange={(e) => setAnonymousForm((f) => ({ ...f, message: e.target.value }))} required /><Button className="w-full" disabled={submitAnonymous.isPending}>Submit anonymously</Button></form></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle><CalendarDays className="mr-2 inline h-4 w-4" />Milestones</CardTitle></CardHeader>
            <CardContent className="space-y-3">{[...(milestones?.birthdays ?? []), ...(milestones?.anniversaries ?? []), ...(milestones?.newJoiners ?? [])].slice(0, 10).map((item: { type: string; employee: Option; daysUntil?: number; years?: number }, index: number) => <div key={`${item.type}-${item.employee.id}-${index}`} className="rounded border border-line p-3"><div className="flex justify-between"><p className="text-sm font-medium">{employeeName(item.employee)}</p><Badge variant="info">{item.type.replace(/_/g, ' ')}</Badge></div><p className="text-xs text-ink-muted">{item.daysUntil != null ? `in ${item.daysUntil} days` : 'recent joiner'}{item.years ? ` · ${item.years} years` : ''}</p></div>)}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Feedback inbox</CardTitle></CardHeader>
            <CardContent className="space-y-3">{(anonymousFeedback ?? []).slice(0, 8).map((row: { id: string; category: string; message: string; sentiment?: string; submittedAt: string }) => <div key={row.id} className="rounded border border-line p-3"><div className="flex items-center gap-2"><Badge variant="outline">{row.category}</Badge>{row.sentiment && <Badge variant="warning">{row.sentiment}</Badge>}</div><p className="mt-2 text-sm text-ink-muted">{row.message}</p><p className="mt-1 text-[11px] text-ink-faint">{formatDate(row.submittedAt)}</p></div>)}</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
