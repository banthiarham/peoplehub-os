'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Check,
  ExternalLink,
  FileSignature,
  Mail,
  MoveRight,
  Plus,
  Send,
  Star,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { OpsTextarea } from '@/components/forms/ops-textarea';

const PIPELINE_STAGES = [
  'APPLIED',
  'SCREENING',
  'RECRUITER_CALL',
  'TECHNICAL_ROUND',
  'MANAGER_ROUND',
  'HR_ROUND',
  'OFFER_APPROVAL',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'JOINED',
  'REJECTED',
  'ON_HOLD',
] as const;

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
  REJECTED: 'Rejected',
  ON_HOLD: 'On hold',
};

const STAGE_COLORS = ['#F59E0B', '#8B5CF6', '#3B82F6', '#2F6D5C', '#F43F5E', '#14B8A6', '#6366F1', '#D97706', '#16A34A', '#0EA5E9'];
const tabs = ['Pipeline', 'Jobs', 'Candidates', 'Interviews', 'Offers', 'Analytics'] as const;

type Tab = typeof tabs[number];
type Option = { id: string; name: string; firstName?: string; lastName?: string; grade?: string };

interface JobRow {
  id: string;
  title: string;
  openings: number;
  status: string;
  approvalStatus: string;
  priority?: string | null;
  targetStartDate?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  jobDescription?: string | null;
  candidateCount: number;
}

interface CandidateRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  currentStage: string;
  source?: string | null;
  tags: string[];
  expectedCTC?: number | null;
  resumeKey?: string | null;
  resumeFileName?: string | null;
  resumeParsed?: Record<string, unknown>;
  jobRequisition: { id: string; title: string };
}

interface PipelineStage {
  stage: string;
  count: number;
  candidates: CandidateRow[];
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
  candidate: { id?: string; firstName: string; lastName: string; currentStage: string };
  jobRequisition: { id?: string; title: string };
}

interface OfferRow {
  id: string;
  candidateId: string;
  ctc: number;
  fixedPay?: number | null;
  variablePay?: number | null;
  joiningDate: string;
  designation?: string | null;
  status: string;
  approvalStatus: string;
  letterKey?: string | null;
  letterHtml?: string | null;
  candidate: CandidateRow;
}

const money = (value?: number | null) =>
  value === undefined || value === null ? '-' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const names = (rows?: Option[]) => rows ?? [];
const employeeName = (employee: Option) => `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() || employee.name;
const errorMessage = (error: unknown) => {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? 'Action failed';
};

const initialJob = {
  title: '',
  openings: '1',
  departmentId: '',
  locationId: '',
  designationId: '',
  hiringManagerId: '',
  priority: 'MEDIUM',
  targetStartDate: '',
  jobDescription: '',
  requirements: '',
};

const initialCandidate = {
  jobRequisitionId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  source: 'Referral',
  tags: '',
  resumeKey: '',
  resumeFileName: '',
  expectedCTC: '',
  notes: '',
};

export default function RecruitmentPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Pipeline');
  const [error, setError] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState(initialJob);
  const [candidateForm, setCandidateForm] = useState(initialCandidate);
  const [interviewForm, setInterviewForm] = useState({
    candidateId: '',
    stage: 'TECHNICAL_ROUND',
    scheduledAt: '',
    interviewers: '',
    mode: 'VIDEO',
  });
  const [scorecard, setScorecard] = useState({
    interviewId: '',
    technical: '4',
    communication: '4',
    roleFit: '4',
    recommendation: 'HIRE',
    strengths: '',
    concerns: '',
  });
  const [offerForm, setOfferForm] = useState({
    candidateId: '',
    ctc: '',
    fixedPay: '',
    variablePay: '',
    joiningDate: '',
    designation: '',
    designationId: '',
    locationId: '',
    salaryStructureId: '',
  });
  const [conversion, setConversion] = useState({
    candidateId: '',
    employeeCode: '',
    joiningDate: '',
    legalEntityId: '',
    departmentId: '',
    designationId: '',
    locationId: '',
  });
  const [communication, setCommunication] = useState({
    candidateId: '',
    channel: 'EMAIL',
    subject: '',
    body: '',
  });

  const { data: stats } = useQuery({
    queryKey: ['recruitment', 'stats'],
    queryFn: () => api.get('/recruitment/stats').then((r) => r.data),
  });
  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['recruitment', 'pipeline'],
    queryFn: () => api.get('/recruitment/pipeline').then((r) => r.data as PipelineStage[]),
  });
  const { data: jobs } = useQuery({
    queryKey: ['recruitment', 'jobs'],
    queryFn: () => api.get('/recruitment/jobs').then((r) => r.data as JobRow[]),
  });
  const { data: candidatesResult } = useQuery({
    queryKey: ['recruitment', 'candidates'],
    queryFn: () => api.get('/recruitment/candidates?pageSize=100').then((r) => r.data as { data: CandidateRow[] }),
  });
  const { data: interviews } = useQuery({
    queryKey: ['recruitment', 'interviews'],
    queryFn: () => api.get('/recruitment/interviews').then((r) => r.data as InterviewRow[]),
  });
  const { data: offers } = useQuery({
    queryKey: ['recruitment', 'offers'],
    queryFn: () => api.get('/recruitment/offers').then((r) => r.data as OfferRow[]),
  });
  const { data: options } = useQuery({
    queryKey: ['employees', 'meta-options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as {
      departments: Option[];
      designations: Option[];
      locations: Option[];
      legalEntities: Option[];
      managers: Option[];
      salaryStructures: Option[];
    }),
  });

  const candidates = candidatesResult?.data ?? [];
  const stages = (pipeline ?? []).filter((s) => s.stage !== 'JOINED' || s.count > 0);
  const openJobs = useMemo(() => (jobs ?? []).filter((job) => job.status === 'OPEN'), [jobs]);
  const acceptedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.currentStage === 'OFFER_ACCEPTED'),
    [candidates],
  );

  const refreshRecruitment = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ['recruitment'] });
    void qc.invalidateQueries({ queryKey: ['employees'] });
  };

  const createJob = useMutation({
    mutationFn: () => api.post('/recruitment/jobs', {
      ...jobForm,
      openings: Number(jobForm.openings),
      departmentId: jobForm.departmentId || undefined,
      locationId: jobForm.locationId || undefined,
      designationId: jobForm.designationId || undefined,
      hiringManagerId: jobForm.hiringManagerId || undefined,
      targetStartDate: jobForm.targetStartDate || undefined,
    }),
    onSuccess: () => {
      setJobForm(initialJob);
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const approveJob = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      api.patch(`/recruitment/jobs/${id}/approval`, { status, reason: status === 'REJECTED' ? 'Rejected during requisition review' : undefined }),
    onSuccess: refreshRecruitment,
    onError: (err) => setError(errorMessage(err)),
  });
  const createCandidate = useMutation({
    mutationFn: () => api.post('/recruitment/candidates', {
      ...candidateForm,
      tags: candidateForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      expectedCTC: candidateForm.expectedCTC ? Number(candidateForm.expectedCTC) : undefined,
      resumeParsed: {
        fileName: candidateForm.resumeFileName || null,
        source: candidateForm.source,
        parsingReady: Boolean(candidateForm.resumeKey || candidateForm.resumeFileName),
      },
    }),
    onSuccess: () => {
      setCandidateForm(initialCandidate);
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const moveCandidate = useMutation({
    mutationFn: ({ id, currentStage }: { id: string; currentStage: string }) =>
      api.patch(`/recruitment/candidates/${id}`, { currentStage }),
    onSuccess: refreshRecruitment,
    onError: (err) => setError(errorMessage(err)),
  });
  const sendCommunication = useMutation({
    mutationFn: () => api.post(`/recruitment/candidates/${communication.candidateId}/communications`, {
      channel: communication.channel,
      subject: communication.subject || undefined,
      body: communication.body,
    }),
    onSuccess: () => {
      setCommunication({ candidateId: '', channel: 'EMAIL', subject: '', body: '' });
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const scheduleInterview = useMutation({
    mutationFn: () => api.post('/recruitment/interviews', {
      ...interviewForm,
      interviewers: interviewForm.interviewers.split(',').map((i) => i.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      setInterviewForm({ candidateId: '', stage: 'TECHNICAL_ROUND', scheduledAt: '', interviewers: '', mode: 'VIDEO' });
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submitScorecard = useMutation({
    mutationFn: () => api.post(`/recruitment/interviews/${scorecard.interviewId}/scorecard`, {
      competencies: [
        { name: 'Technical depth', rating: Number(scorecard.technical), weight: 2 },
        { name: 'Communication', rating: Number(scorecard.communication), weight: 1 },
        { name: 'Role fit', rating: Number(scorecard.roleFit), weight: 1 },
      ],
      recommendation: scorecard.recommendation,
      strengths: scorecard.strengths,
      concerns: scorecard.concerns,
    }),
    onSuccess: () => {
      setScorecard({ interviewId: '', technical: '4', communication: '4', roleFit: '4', recommendation: 'HIRE', strengths: '', concerns: '' });
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const createOffer = useMutation({
    mutationFn: () => api.post('/recruitment/offers', {
      ...offerForm,
      ctc: Number(offerForm.ctc),
      fixedPay: offerForm.fixedPay ? Number(offerForm.fixedPay) : undefined,
      variablePay: offerForm.variablePay ? Number(offerForm.variablePay) : undefined,
      designationId: offerForm.designationId || undefined,
      locationId: offerForm.locationId || undefined,
      salaryStructureId: offerForm.salaryStructureId || undefined,
    }),
    onSuccess: () => {
      setOfferForm({ candidateId: '', ctc: '', fixedPay: '', variablePay: '', joiningDate: '', designation: '', designationId: '', locationId: '', salaryStructureId: '' });
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const approveOffer = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      api.patch(`/recruitment/offers/${id}/approval`, { status, reason: status === 'REJECTED' ? 'Rejected during compensation approval' : undefined }),
    onSuccess: refreshRecruitment,
    onError: (err) => setError(errorMessage(err)),
  });
  const updateOfferStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/recruitment/offers/${id}`, { status }),
    onSuccess: refreshRecruitment,
    onError: (err) => setError(errorMessage(err)),
  });
  const generateLetter = useMutation({
    mutationFn: (id: string) => api.post(`/recruitment/offers/${id}/generate-letter`),
    onSuccess: refreshRecruitment,
    onError: (err) => setError(errorMessage(err)),
  });
  const convertCandidate = useMutation({
    mutationFn: () => api.post(`/recruitment/candidates/${conversion.candidateId}/convert`, {
      employeeCode: conversion.employeeCode || undefined,
      joiningDate: conversion.joiningDate || undefined,
      legalEntityId: conversion.legalEntityId || undefined,
      departmentId: conversion.departmentId || undefined,
      designationId: conversion.designationId || undefined,
      locationId: conversion.locationId || undefined,
    }),
    onSuccess: () => {
      setConversion({ candidateId: '', employeeCode: '', joiningDate: '', legalEntityId: '', departmentId: '', designationId: '', locationId: '' });
      refreshRecruitment();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Talent"
        title="Recruitment"
        description="Requisitions, pipeline, interviews, offers and conversion"
        meta={
          <>
            <Badge variant="outline">{stats?.openJobs ?? 0} open jobs</Badge>
            <Badge variant="outline">{stats?.totalCandidates ?? 0} candidates</Badge>
            <Badge variant="outline">{stats?.offersPending ?? 0} offers pending</Badge>
          </>
        }
      />
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open positions" value={stats?.openJobs ?? '-'} icon={Briefcase} />
        <StatCard label="Total candidates" value={stats?.totalCandidates ?? '-'} icon={Users} />
        <StatCard label="Interviews this week" value={stats?.interviewsThisWeek ?? '-'} icon={CalendarClock} />
        <StatCard label="Offers pending approval" value={stats?.offersPending ?? '-'} icon={FileSignature} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Button key={tab} type="button" variant={activeTab === tab ? 'secondary' : 'outline'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
        <Button type="button" variant="outline" className="ml-auto" onClick={() => window.open('/careers/demo-corp', '_blank', 'noreferrer')}>
          <ExternalLink className="h-4 w-4" /> Careers page
        </Button>
      </div>

      {activeTab === 'Pipeline' && (
        isLoading ? (
          <div className="flex gap-4 overflow-x-auto">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-96 w-64 shrink-0" />)}
          </div>
        ) : (
          <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-2">
            {stages.map((stage, idx) => (
              <div key={stage.stage} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[idx % STAGE_COLORS.length] }} />
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
                          <p className="truncate text-sm font-medium">{c.firstName} {c.lastName}</p>
                          <p className="truncate text-[11px] text-ink-muted">{c.jobRequisition.title}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Select
                          className="min-w-0 flex-1"
                          value={c.currentStage}
                          onChange={(e) => moveCandidate.mutate({ id: c.id, currentStage: e.target.value })}
                        >
                          {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                        </Select>
                        <Button type="button" size="icon" variant="outline" onClick={() => setCommunication((f) => ({ ...f, candidateId: c.id, subject: `Update for ${c.jobRequisition.title}` }))}>
                          <Mail className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(c.tags ?? []).slice(0, 3).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
                      </div>
                    </Card>
                  ))}
                  {stage.candidates.length === 0 && (
                    <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink-faint">No candidates</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'Jobs' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <Card>
            <CardHeader><CardTitle>Create requisition</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Input placeholder="Job title" value={jobForm.title} onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="number" min={1} value={jobForm.openings} onChange={(e) => setJobForm((f) => ({ ...f, openings: e.target.value }))} />
                <Select value={jobForm.priority} onChange={(e) => setJobForm((f) => ({ ...f, priority: e.target.value }))}>
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
                <Select value={jobForm.departmentId} onChange={(e) => setJobForm((f) => ({ ...f, departmentId: e.target.value }))}>
                  <option value="">Department</option>
                  {names(options?.departments).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={jobForm.locationId} onChange={(e) => setJobForm((f) => ({ ...f, locationId: e.target.value }))}>
                  <option value="">Location</option>
                  {names(options?.locations).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={jobForm.designationId} onChange={(e) => setJobForm((f) => ({ ...f, designationId: e.target.value }))}>
                  <option value="">Designation</option>
                  {names(options?.designations).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={jobForm.hiringManagerId} onChange={(e) => setJobForm((f) => ({ ...f, hiringManagerId: e.target.value }))}>
                  <option value="">Hiring manager</option>
                  {names(options?.managers).map((o) => <option key={o.id} value={o.id}>{employeeName(o)}</option>)}
                </Select>
              </div>
              <Input type="date" value={jobForm.targetStartDate} onChange={(e) => setJobForm((f) => ({ ...f, targetStartDate: e.target.value }))} />
              <OpsTextarea placeholder="Job description" value={jobForm.jobDescription} onChange={(e) => setJobForm((f) => ({ ...f, jobDescription: e.target.value }))} />
              <OpsTextarea placeholder="Requirements" value={jobForm.requirements} onChange={(e) => setJobForm((f) => ({ ...f, requirements: e.target.value }))} />
              <Button type="button" disabled={!jobForm.title || createJob.isPending} onClick={() => createJob.mutate()}>
                <Plus className="h-4 w-4" /> Save requisition
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Requisition approvals</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Role</TH><TH>Openings</TH><TH>Approval</TH><TH>Action</TH></TR></THead>
              <TBody>
                {(jobs ?? []).map((job) => (
                  <TR key={job.id}>
                    <TD>
                      <p className="font-medium">{job.title}</p>
                      <p className="text-xs text-ink-muted">{job.priority ?? 'MEDIUM'} · target {formatDate(job.targetStartDate)}</p>
                    </TD>
                    <TD>{job.openings} · {job.candidateCount} candidates</TD>
                    <TD><Badge variant={statusVariant(job.approvalStatus)}>{job.approvalStatus}</Badge></TD>
                    <TD>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => approveJob.mutate({ id: job.id, status: 'APPROVED' })}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => approveJob.mutate({ id: job.id, status: 'REJECTED' })}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      {activeTab === 'Candidates' && (
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle>Add candidate</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Select value={candidateForm.jobRequisitionId} onChange={(e) => setCandidateForm((f) => ({ ...f, jobRequisitionId: e.target.value }))}>
                <option value="">Select approved requisition</option>
                {openJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </Select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="First name" value={candidateForm.firstName} onChange={(e) => setCandidateForm((f) => ({ ...f, firstName: e.target.value }))} />
                <Input placeholder="Last name" value={candidateForm.lastName} onChange={(e) => setCandidateForm((f) => ({ ...f, lastName: e.target.value }))} />
              </div>
              <Input type="email" placeholder="Email" value={candidateForm.email} onChange={(e) => setCandidateForm((f) => ({ ...f, email: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Phone" value={candidateForm.phone} onChange={(e) => setCandidateForm((f) => ({ ...f, phone: e.target.value }))} />
                <Input type="number" placeholder="Expected CTC" value={candidateForm.expectedCTC} onChange={(e) => setCandidateForm((f) => ({ ...f, expectedCTC: e.target.value }))} />
                <Input placeholder="Source" value={candidateForm.source} onChange={(e) => setCandidateForm((f) => ({ ...f, source: e.target.value }))} />
                <Input placeholder="Tags: react, referral" value={candidateForm.tags} onChange={(e) => setCandidateForm((f) => ({ ...f, tags: e.target.value }))} />
              </div>
              <Input placeholder="Resume file name" value={candidateForm.resumeFileName} onChange={(e) => setCandidateForm((f) => ({ ...f, resumeFileName: e.target.value }))} />
              <Input placeholder="Resume object key" value={candidateForm.resumeKey} onChange={(e) => setCandidateForm((f) => ({ ...f, resumeKey: e.target.value }))} />
              <OpsTextarea placeholder="Notes" value={candidateForm.notes} onChange={(e) => setCandidateForm((f) => ({ ...f, notes: e.target.value }))} />
              <Button type="button" disabled={!candidateForm.jobRequisitionId || !candidateForm.email || createCandidate.isPending} onClick={() => createCandidate.mutate()}>
                <UserCheck className="h-4 w-4" /> Add candidate
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Candidate directory</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Candidate</TH><TH>Role</TH><TH>Stage</TH><TH>Resume</TH><TH>Communication</TH></TR></THead>
              <TBody>
                {candidates.map((candidate) => (
                  <TR key={candidate.id}>
                    <TD>
                      <p className="font-medium">{candidate.firstName} {candidate.lastName}</p>
                      <p className="text-xs text-ink-muted">{candidate.email}</p>
                    </TD>
                    <TD>{candidate.jobRequisition.title}</TD>
                    <TD><Badge variant={statusVariant(candidate.currentStage)}>{STAGE_LABELS[candidate.currentStage] ?? candidate.currentStage}</Badge></TD>
                    <TD className="text-xs text-ink-muted">{candidate.resumeFileName ?? (candidate.resumeKey ? 'Uploaded' : 'Pending')}</TD>
                    <TD>
                      <Button type="button" size="sm" variant="outline" onClick={() => setCommunication((f) => ({ ...f, candidateId: candidate.id }))}>
                        <Mail className="h-3.5 w-3.5" /> Log
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Candidate communication</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_0.7fr_1fr_auto]">
              <Select value={communication.candidateId} onChange={(e) => setCommunication((f) => ({ ...f, candidateId: e.target.value }))}>
                <option value="">Candidate</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </Select>
              <Select value={communication.channel} onChange={(e) => setCommunication((f) => ({ ...f, channel: e.target.value }))}>
                {['EMAIL', 'PHONE', 'WHATSAPP', 'NOTE'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input placeholder="Subject" value={communication.subject} onChange={(e) => setCommunication((f) => ({ ...f, subject: e.target.value }))} />
              <Button type="button" disabled={!communication.candidateId || !communication.body || sendCommunication.isPending} onClick={() => sendCommunication.mutate()}>
                <Send className="h-4 w-4" /> Save
              </Button>
              <OpsTextarea className="md:col-span-4" placeholder="Message or call note" value={communication.body} onChange={(e) => setCommunication((f) => ({ ...f, body: e.target.value }))} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Interviews' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <Card>
            <CardHeader><CardTitle>Schedule interview</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Select value={interviewForm.candidateId} onChange={(e) => setInterviewForm((f) => ({ ...f, candidateId: e.target.value }))}>
                <option value="">Candidate</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.jobRequisition.title}</option>)}
              </Select>
              <Select value={interviewForm.stage} onChange={(e) => setInterviewForm((f) => ({ ...f, stage: e.target.value }))}>
                {PIPELINE_STAGES.slice(2, 6).map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </Select>
              <Input type="datetime-local" value={interviewForm.scheduledAt} onChange={(e) => setInterviewForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
              <Input placeholder="Interviewers, comma separated" value={interviewForm.interviewers} onChange={(e) => setInterviewForm((f) => ({ ...f, interviewers: e.target.value }))} />
              <Select value={interviewForm.mode} onChange={(e) => setInterviewForm((f) => ({ ...f, mode: e.target.value }))}>
                {['VIDEO', 'IN_PERSON', 'PHONE'].map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Button type="button" disabled={!interviewForm.candidateId || !interviewForm.scheduledAt || scheduleInterview.isPending} onClick={() => scheduleInterview.mutate()}>
                <CalendarClock className="h-4 w-4" /> Schedule
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Scorecard</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Select value={scorecard.interviewId} onChange={(e) => setScorecard((f) => ({ ...f, interviewId: e.target.value }))}>
                <option value="">Interview</option>
                {(interviews ?? []).map((i) => <option key={i.id} value={i.id}>{i.candidate.firstName} {i.candidate.lastName} · {formatDate(i.scheduledAt)}</option>)}
              </Select>
              <div className="grid gap-3 sm:grid-cols-4">
                <Input type="number" min={1} max={5} value={scorecard.technical} onChange={(e) => setScorecard((f) => ({ ...f, technical: e.target.value }))} />
                <Input type="number" min={1} max={5} value={scorecard.communication} onChange={(e) => setScorecard((f) => ({ ...f, communication: e.target.value }))} />
                <Input type="number" min={1} max={5} value={scorecard.roleFit} onChange={(e) => setScorecard((f) => ({ ...f, roleFit: e.target.value }))} />
                <Select value={scorecard.recommendation} onChange={(e) => setScorecard((f) => ({ ...f, recommendation: e.target.value }))}>
                  {['STRONG_HIRE', 'HIRE', 'HOLD', 'NO_HIRE'].map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </div>
              <OpsTextarea placeholder="Strengths" value={scorecard.strengths} onChange={(e) => setScorecard((f) => ({ ...f, strengths: e.target.value }))} />
              <OpsTextarea placeholder="Concerns" value={scorecard.concerns} onChange={(e) => setScorecard((f) => ({ ...f, concerns: e.target.value }))} />
              <Button type="button" disabled={!scorecard.interviewId || submitScorecard.isPending} onClick={() => submitScorecard.mutate()}>
                <Star className="h-4 w-4" /> Submit scorecard
              </Button>
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Interview calendar</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Candidate</TH><TH>Role</TH><TH>When</TH><TH>Result</TH></TR></THead>
              <TBody>
                {(interviews ?? []).map((interview) => (
                  <TR key={interview.id}>
                    <TD>{interview.candidate.firstName} {interview.candidate.lastName}</TD>
                    <TD>{interview.jobRequisition.title}</TD>
                    <TD>{formatDate(interview.scheduledAt)}</TD>
                    <TD><Badge variant={statusVariant(interview.result ?? 'PENDING')}>{interview.scorecard?.recommendation ?? interview.result ?? 'Pending'}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      {activeTab === 'Offers' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <Card>
            <CardHeader><CardTitle>Create offer</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Select value={offerForm.candidateId} onChange={(e) => setOfferForm((f) => ({ ...f, candidateId: e.target.value }))}>
                <option value="">Candidate</option>
                {candidates.filter((c) => !['REJECTED', 'JOINED'].includes(c.currentStage)).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </Select>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input type="number" placeholder="CTC" value={offerForm.ctc} onChange={(e) => setOfferForm((f) => ({ ...f, ctc: e.target.value }))} />
                <Input type="number" placeholder="Fixed pay" value={offerForm.fixedPay} onChange={(e) => setOfferForm((f) => ({ ...f, fixedPay: e.target.value }))} />
                <Input type="number" placeholder="Variable pay" value={offerForm.variablePay} onChange={(e) => setOfferForm((f) => ({ ...f, variablePay: e.target.value }))} />
              </div>
              <Input type="date" value={offerForm.joiningDate} onChange={(e) => setOfferForm((f) => ({ ...f, joiningDate: e.target.value }))} />
              <Input placeholder="Designation text" value={offerForm.designation} onChange={(e) => setOfferForm((f) => ({ ...f, designation: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={offerForm.designationId} onChange={(e) => setOfferForm((f) => ({ ...f, designationId: e.target.value }))}>
                  <option value="">Designation</option>
                  {names(options?.designations).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={offerForm.locationId} onChange={(e) => setOfferForm((f) => ({ ...f, locationId: e.target.value }))}>
                  <option value="">Location</option>
                  {names(options?.locations).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={offerForm.salaryStructureId} onChange={(e) => setOfferForm((f) => ({ ...f, salaryStructureId: e.target.value }))}>
                  <option value="">Salary structure</option>
                  {names(options?.salaryStructures).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </div>
              <Button type="button" disabled={!offerForm.candidateId || !offerForm.ctc || !offerForm.joiningDate || createOffer.isPending} onClick={() => createOffer.mutate()}>
                <FileSignature className="h-4 w-4" /> Create approval request
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Offer approvals and letters</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Candidate</TH><TH>CTC</TH><TH>Status</TH><TH>Actions</TH></TR></THead>
              <TBody>
                {(offers ?? []).map((offer) => (
                  <TR key={offer.id}>
                    <TD>
                      <p className="font-medium">{offer.candidate.firstName} {offer.candidate.lastName}</p>
                      <p className="text-xs text-ink-muted">{offer.designation ?? offer.candidate.jobRequisition.title} · joins {formatDate(offer.joiningDate)}</p>
                    </TD>
                    <TD>{money(offer.ctc)}</TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant(offer.approvalStatus)}>{offer.approvalStatus}</Badge>
                        <Badge variant={statusVariant(offer.status)}>{offer.status}</Badge>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => approveOffer.mutate({ id: offer.id, status: 'APPROVED' })}><BadgeCheck className="h-3.5 w-3.5" /> Approve</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => generateLetter.mutate(offer.id)}>Letter</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => updateOfferStatus.mutate({ id: offer.id, status: 'SENT' })}>Send</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => updateOfferStatus.mutate({ id: offer.id, status: 'ACCEPTED' })}>Accept</Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Convert accepted candidate</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Select value={conversion.candidateId} onChange={(e) => setConversion((f) => ({ ...f, candidateId: e.target.value }))}>
                <option value="">Accepted candidate</option>
                {acceptedCandidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </Select>
              <Input placeholder="Employee code (optional)" value={conversion.employeeCode} onChange={(e) => setConversion((f) => ({ ...f, employeeCode: e.target.value }))} />
              <Input type="date" value={conversion.joiningDate} onChange={(e) => setConversion((f) => ({ ...f, joiningDate: e.target.value }))} />
              <Select value={conversion.legalEntityId} onChange={(e) => setConversion((f) => ({ ...f, legalEntityId: e.target.value }))}>
                <option value="">Legal entity</option>
                {names(options?.legalEntities).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Select value={conversion.departmentId} onChange={(e) => setConversion((f) => ({ ...f, departmentId: e.target.value }))}>
                <option value="">Department</option>
                {names(options?.departments).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Select value={conversion.designationId} onChange={(e) => setConversion((f) => ({ ...f, designationId: e.target.value }))}>
                <option value="">Designation</option>
                {names(options?.designations).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Select value={conversion.locationId} onChange={(e) => setConversion((f) => ({ ...f, locationId: e.target.value }))}>
                <option value="">Location</option>
                {names(options?.locations).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Button type="button" disabled={!conversion.candidateId || convertCandidate.isPending} onClick={() => convertCandidate.mutate()}>
                Convert <MoveRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Analytics' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Pipeline funnel</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(stats?.pipelineFunnel ?? []).map((row: { stage: string; count: number }) => (
                <div key={row.stage}>
                  <div className="mb-1 flex justify-between text-sm"><span>{STAGE_LABELS[row.stage] ?? row.stage}</span><span>{row.count}</span></div>
                  <div className="h-2 rounded bg-canvas"><div className="h-2 rounded bg-primary-700" style={{ width: `${Math.min(100, row.count * 12)}%` }} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Source breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(stats?.sourceBreakdown ?? []).map((row: { source: string; count: number }) => (
                <div key={row.source} className="flex items-center justify-between rounded-lg border border-line p-3">
                  <span className="font-medium">{row.source}</span>
                  <Badge variant="outline">{row.count}</Badge>
                </div>
              ))}
              <p className="text-sm text-ink-muted">Average time to hire: {stats?.timeToHireAvgDays ?? '-'} days</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
