'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, LifeBuoy, MessageSquare, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { OpsNewTicketDialog } from '@/components/forms/ops-new-ticket-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { OpsTextarea } from '@/components/forms/ops-textarea';

type Tab = 'Tickets' | 'Knowledge Base' | 'AI Assistant' | 'SLA Rules';
type Option = { id: string; firstName: string; lastName: string };

interface TicketRow {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  assignedTo?: string | null;
  escalatedTo?: string | null;
  sla?: { dueAt: string; hours: number; breached: boolean; assigneeQueue?: string | null };
  employee: { firstName: string; lastName: string; employeeCode: string };
  _count: { comments: number };
}

interface TicketDetail {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assignedTo?: string | null;
  escalatedTo?: string | null;
  sla?: { dueAt: string; hours: number; breached: boolean; assigneeQueue?: string | null };
  attachments: string[];
  employee: { id: string; firstName: string; lastName: string; employeeCode: string; status: string };
  comments: Array<{ id: string; message: string; isInternal: boolean; isAiGenerated: boolean; createdAt: string }>;
}

interface KnowledgeBaseRow {
  id: string;
  title: string;
  summary?: string | null;
  body: string;
  category: string;
  status: string;
  sourceType: string;
  tags: string[];
  updatedAt: string;
  viewCount: number;
}

interface SlaRuleRow {
  id: string;
  category: string;
  priority: string | null;
  responseHours: number | null;
  resolutionHours: number;
  assigneeQueue: string;
  isActive: boolean;
}

const categories = ['PAYROLL', 'ATTENDANCE', 'LEAVE', 'BENEFITS', 'EXPENSES', 'DOCUMENTS', 'ONBOARDING', 'OFFBOARDING', 'IT', 'ADMIN', 'GRIEVANCE', 'GENERAL HR'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const statuses = ['OPEN', 'IN_PROGRESS', 'WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED'];
const tabs: Tab[] = ['Tickets', 'Knowledge Base', 'AI Assistant', 'SLA Rules'];

const employeeName = (employee?: Option | { firstName?: string; lastName?: string }) =>
  `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim() || 'Employee';

export default function HelpdeskPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Tickets');
  const [status, setStatus] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState({ status: 'IN_PROGRESS', assignedTo: '', note: '', internal: 'false', escalateReason: '' });
  const [kbForm, setKbForm] = useState({ title: '', summary: '', category: 'GENERAL', body: '', tags: '', sourceType: 'ARTICLE', status: 'PUBLISHED' });
  const [ruleForm, setRuleForm] = useState({ category: 'PAYROLL', priority: 'HIGH', responseHours: '2', resolutionHours: '8', assigneeQueue: 'Payroll Admin', isActive: 'true' });
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiCategory, setAiCategory] = useState('');

  const { data: stats } = useQuery({ queryKey: ['helpdesk', 'stats'], queryFn: () => api.get('/helpdesk/stats').then((r) => r.data) });
  const { data: tickets } = useQuery({
    queryKey: ['helpdesk', 'tickets', status],
    queryFn: () => api.get('/helpdesk/tickets', { params: { status: status || undefined, pageSize: 50 } }).then((r) => r.data),
  });
  const { data: selectedTicket } = useQuery({
    queryKey: ['helpdesk', 'ticket', selectedTicketId],
    enabled: !!selectedTicketId,
    queryFn: () => api.get(`/helpdesk/tickets/${selectedTicketId}`).then((r) => r.data as TicketDetail),
  });
  const { data: kb } = useQuery({
    queryKey: ['helpdesk', 'knowledge-base'],
    queryFn: () => api.get('/helpdesk/knowledge-base').then((r) => r.data as KnowledgeBaseRow[]),
  });
  const { data: kbStats } = useQuery({
    queryKey: ['helpdesk', 'knowledge-base', 'stats'],
    queryFn: () => api.get('/helpdesk/knowledge-base/stats').then((r) => r.data),
  });
  const { data: slaRules } = useQuery({
    queryKey: ['helpdesk', 'sla-rules'],
    queryFn: () => api.get('/helpdesk/sla-rules').then((r) => r.data as SlaRuleRow[]),
  });
  const { data: aiAnswer } = useQuery({
    queryKey: ['helpdesk', 'ai-answer', aiQuestion, aiCategory],
    enabled: false,
    queryFn: () => api.post('/helpdesk/ai-answer', { question: aiQuestion, category: aiCategory || undefined }).then((r) => r.data),
  });
  const { data: employeeOptions } = useQuery({
    queryKey: ['employees', 'meta-options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as { managers: Option[] }),
  });

  const employees = employeeOptions?.managers ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['helpdesk'] });
  const createKb = useMutation({
    mutationFn: () =>
      api.post('/helpdesk/knowledge-base', {
        ...kbForm,
        tags: kbForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['helpdesk', 'knowledge-base'] });
      setKbForm((f) => ({ ...f, title: '', summary: '', body: '', tags: '' }));
    },
  });
  const createRule = useMutation({
    mutationFn: () =>
      api.post('/helpdesk/sla-rules', {
        ...ruleForm,
        responseHours: Number(ruleForm.responseHours) || undefined,
        resolutionHours: Number(ruleForm.resolutionHours),
        isActive: ruleForm.isActive === 'true',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['helpdesk', 'sla-rules'] }),
  });
  const updateTicket = useMutation({
    mutationFn: () => api.patch(`/helpdesk/tickets/${selectedTicketId}`, { status: detailForm.status, assignedTo: detailForm.assignedTo || undefined }),
    onSuccess: () => invalidate(),
  });
  const addComment = useMutation({
    mutationFn: () =>
      api.post(`/helpdesk/tickets/${selectedTicketId}/comments`, {
        message: detailForm.note,
        isInternal: detailForm.internal === 'true',
      }),
    onSuccess: () => {
      setDetailForm((f) => ({ ...f, note: '' }));
      invalidate();
    },
  });
  const escalate = useMutation({
    mutationFn: () =>
      api.post(`/helpdesk/tickets/${selectedTicketId}/escalate`, {
        assignedTo: detailForm.assignedTo || undefined,
        reason: detailForm.escalateReason || undefined,
      }),
    onSuccess: () => invalidate(),
  });
  const askAi = useMutation({
    mutationFn: () => api.post('/helpdesk/ai-answer', { question: aiQuestion, category: aiCategory || undefined }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['helpdesk', 'ai-answer', aiQuestion, aiCategory], data),
  });

  const submit = (event: FormEvent, fn: () => void) => {
    event.preventDefault();
    fn();
  };

  return (
    <div>
      <PageHeader title="Helpdesk" description="Employee queries, tickets, knowledge base and AI answers" actions={<OpsNewTicketDialog />} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Open" value={stats?.open ?? '—'} icon={LifeBuoy} />
        <StatCard label="In progress" value={stats?.inProgress ?? '—'} />
        <StatCard label="Resolved this week" value={stats?.resolvedThisWeek ?? '—'} />
        <StatCard label="SLA breached" value={stats?.slaBreached ?? '—'} icon={ShieldAlert} />
        <StatCard label="KB articles" value={kbStats?.articles ?? '—'} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button key={tab} size="sm" variant={activeTab === tab ? 'default' : 'outline'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'Tickets' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
          <Card>
            <div className="flex items-center gap-3 border-b border-line p-4">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {statuses.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
              </Select>
            </div>
            {tickets?.data?.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Ticket</TH>
                    <TH>Raised by</TH>
                    <TH>Category</TH>
                    <TH>Priority</TH>
                    <TH>Queue</TH>
                    <TH>SLA</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {tickets.data.map((ticket: TicketRow) => (
                    <TR key={ticket.id} className="cursor-pointer" onClick={() => setSelectedTicketId(ticket.id)}>
                      <TD>
                        <span className="flex items-center gap-2 font-medium">
                          {ticket.subject}
                          {ticket._count.comments > 0 && (
                            <span className="flex items-center gap-1 text-xs text-ink-faint">
                              <MessageSquare className="h-3 w-3" /> {ticket._count.comments}
                            </span>
                          )}
                        </span>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar name={`${ticket.employee.firstName} ${ticket.employee.lastName}`} size="sm" />
                          <span className="text-ink-muted">{ticket.employee.firstName} {ticket.employee.lastName}</span>
                        </div>
                      </TD>
                      <TD><Badge variant="outline">{ticket.category}</Badge></TD>
                      <TD><Badge variant={ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? 'destructive' : 'outline'}>{ticket.priority}</Badge></TD>
                      <TD className="text-ink-muted">{ticket.assignedTo ?? 'Unassigned'}</TD>
                      <TD><Badge variant={ticket.sla?.breached ? 'destructive' : 'outline'}>{ticket.sla?.breached ? 'Breached' : `Due ${ticket.sla?.dueAt ? formatDate(ticket.sla.dueAt) : '—'}`}</Badge></TD>
                      <TD><Badge variant={statusVariant(ticket.status)}>{ticket.status.replace(/_/g, ' ')}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-sm text-ink-muted">No tickets found.</div>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Ticket detail</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {selectedTicket ? (
                <>
                  <div>
                    <p className="text-sm font-medium">{selectedTicket.subject}</p>
                    <p className="text-xs text-ink-muted">{selectedTicket.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedTicket.category}</Badge>
                    <Badge variant={selectedTicket.sla?.breached ? 'destructive' : 'warning'}>
                      {selectedTicket.sla?.breached ? 'SLA breached' : `${selectedTicket.sla?.hours ?? '?'}h SLA`}
                    </Badge>
                    {selectedTicket.escalatedTo && <Badge variant="info">Escalated to {selectedTicket.escalatedTo}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
                    <div>Employee: <b className="text-ink">{employeeName(selectedTicket.employee)}</b></div>
                    <div>Status: <b className="text-ink">{selectedTicket.status}</b></div>
                    <div>Assigned: <b className="text-ink">{selectedTicket.assignedTo ?? 'Unassigned'}</b></div>
                    <div>Attachments: <b className="text-ink">{selectedTicket.attachments.length}</b></div>
                  </div>
                  <form className="space-y-2 rounded-lg border border-line p-3" onSubmit={(e) => submit(e, () => addComment.mutate())}>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={detailForm.status} onChange={(e) => setDetailForm((f) => ({ ...f, status: e.target.value }))}>
                        {['OPEN', 'IN_PROGRESS', 'WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED'].map((item) => <option key={item}>{item}</option>)}
                      </Select>
                      <Select value={detailForm.internal} onChange={(e) => setDetailForm((f) => ({ ...f, internal: e.target.value }))}>
                        <option value="false">Public reply</option>
                        <option value="true">Internal note</option>
                      </Select>
                    </div>
                    <Select value={detailForm.assignedTo} onChange={(e) => setDetailForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                      <option value="">Assign to queue</option>
                      <option value="Payroll Admin">Payroll Admin</option>
                      <option value="HR Operations">HR Operations</option>
                      <option value="IT/Admin">IT/Admin</option>
                      <option value="HR Helpdesk">HR Helpdesk</option>
                    </Select>
                    <OpsTextarea placeholder="Reply or internal note" value={detailForm.note} onChange={(e) => setDetailForm((f) => ({ ...f, note: e.target.value }))} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="secondary" disabled={addComment.isPending}>Add note/reply</Button>
                      <Button type="button" variant="outline" onClick={() => updateTicket.mutate()} disabled={updateTicket.isPending}>Save status</Button>
                      <Button type="button" variant="outline" onClick={() => escalate.mutate()} disabled={escalate.isPending}>Escalate</Button>
                    </div>
                    <Input placeholder="Escalation reason" value={detailForm.escalateReason} onChange={(e) => setDetailForm((f) => ({ ...f, escalateReason: e.target.value }))} />
                  </form>
                  <div className="space-y-2">
                    {selectedTicket.comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-line p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={comment.isInternal ? 'warning' : 'outline'}>{comment.isInternal ? 'Internal' : 'Public'}</Badge>
                          {comment.isAiGenerated && <Badge variant="info">AI</Badge>}
                          <span className="text-[11px] text-ink-faint">{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm text-ink-muted">{comment.message}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-muted">Select a ticket to manage replies, assignments and escalation.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Knowledge Base' && (
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader><CardTitle>Create article or policy</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => createKb.mutate())}>
                <Input placeholder="Title" value={kbForm.title} onChange={(e) => setKbForm((f) => ({ ...f, title: e.target.value }))} required />
                <Input placeholder="Summary" value={kbForm.summary} onChange={(e) => setKbForm((f) => ({ ...f, summary: e.target.value }))} />
                <Select value={kbForm.category} onChange={(e) => setKbForm((f) => ({ ...f, category: e.target.value }))}>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={kbForm.sourceType} onChange={(e) => setKbForm((f) => ({ ...f, sourceType: e.target.value }))}>
                    <option>ARTICLE</option>
                    <option>POLICY</option>
                    <option>FAQ</option>
                  </Select>
                  <Select value={kbForm.status} onChange={(e) => setKbForm((f) => ({ ...f, status: e.target.value }))}>
                    <option>DRAFT</option>
                    <option>APPROVED</option>
                    <option>PUBLISHED</option>
                    <option>ARCHIVED</option>
                  </Select>
                </div>
                <Input placeholder="Tags, comma separated" value={kbForm.tags} onChange={(e) => setKbForm((f) => ({ ...f, tags: e.target.value }))} />
                <OpsTextarea placeholder="Body" value={kbForm.body} onChange={(e) => setKbForm((f) => ({ ...f, body: e.target.value }))} required />
                <Button className="w-full" disabled={createKb.isPending}>Save article</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Approved knowledge base</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {kb?.map((article) => (
                <div key={article.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{article.title}</p>
                    <Badge variant="outline">{article.category}</Badge>
                    <Badge variant={article.status === 'PUBLISHED' ? 'success' : 'warning'}>{article.status}</Badge>
                    <Badge variant="info">{article.sourceType}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{article.summary ?? article.body}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {article.viewCount} views · updated {formatDate(article.updatedAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'AI Assistant' && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader><CardTitle>Ask AI using approved KB</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => askAi.mutate())}>
                <Input placeholder="Ask a helpdesk question" value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} required />
                <Select value={aiCategory} onChange={(e) => setAiCategory(e.target.value)}>
                  <option value="">Any category</option>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Button className="w-full" disabled={askAi.isPending}>
                  <Bot className="h-4 w-4" /> Generate answer
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>AI answer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {aiAnswer ? (
                <>
                  <p className="text-sm text-ink-muted">{aiAnswer.answer}</p>
                  <div className="space-y-2">
                    {aiAnswer.citations?.map((citation: { id: string; title: string; category: string; sourceType: string; summary?: string }) => (
                      <div key={citation.id} className="rounded-lg border border-line p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{citation.title}</p>
                          <Badge variant="outline">{citation.category}</Badge>
                          <Badge variant="info">{citation.sourceType}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">{citation.summary}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-muted">Ask a question to get a grounded answer from approved knowledge-base content.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'SLA Rules' && (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader><CardTitle>Configure SLA rule</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => submit(e, () => createRule.mutate())}>
                <Select value={ruleForm.category} onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value }))}>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Select value={ruleForm.priority} onChange={(e) => setRuleForm((f) => ({ ...f, priority: e.target.value }))}>
                  <option value="">Any priority</option>
                  {priorities.map((item) => <option key={item}>{item}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min="1" value={ruleForm.responseHours} onChange={(e) => setRuleForm((f) => ({ ...f, responseHours: e.target.value }))} />
                  <Input type="number" min="1" value={ruleForm.resolutionHours} onChange={(e) => setRuleForm((f) => ({ ...f, resolutionHours: e.target.value }))} />
                </div>
                <Input value={ruleForm.assigneeQueue} onChange={(e) => setRuleForm((f) => ({ ...f, assigneeQueue: e.target.value }))} />
                <Select value={ruleForm.isActive} onChange={(e) => setRuleForm((f) => ({ ...f, isActive: e.target.value }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
                <Button className="w-full" disabled={createRule.isPending}>Save rule</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Configured rules</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {slaRules?.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{rule.category}</p>
                    {rule.priority && <Badge variant="outline">{rule.priority}</Badge>}
                    <Badge variant={rule.isActive ? 'success' : 'warning'}>{rule.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    Queue {rule.assigneeQueue} · response {rule.responseHours ?? '—'}h · resolution {rule.resolutionHours}h
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
