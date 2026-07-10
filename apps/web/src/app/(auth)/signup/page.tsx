'use client';

import axios from 'axios';
import { Building2, CheckCircle2, ChevronRight, FileSpreadsheet, Loader2, ShieldCheck, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { BRAND } from '@/config/brand';
import { invalidateTokenCache } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const goals = [
  { value: 'payroll', label: 'Run payroll' },
  { value: 'attendance', label: 'Track attendance' },
  { value: 'hr', label: 'Centralize HR data' },
  { value: 'hiring', label: 'Manage hiring' },
  { value: 'explore', label: `Explore ${BRAND.name}` },
];

const companySizes = ['1-50', '51-200', '201-500', '501-1000', '1001-2000', '2000+'];

const signupSteps = [
  {
    title: 'Create workspace',
    detail: 'Tenant, owner account, starter roles and India defaults.',
    icon: Building2,
  },
  {
    title: 'Prepare implementation',
    detail: 'Legal entity, locations, departments and policies.',
    icon: ShieldCheck,
  },
  {
    title: 'Import people data',
    detail: 'Preview employees and salaries before writing records.',
    icon: FileSpreadsheet,
  },
  {
    title: 'Start payroll readiness',
    detail: 'Resolve blockers before the first dry run.',
    icon: UsersRound,
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const errorMessage = (error: unknown) => {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? 'Signup failed. Check the details and try again.';
};

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [legalName, setLegalName] = useState('');
  const [industry, setIndustry] = useState('IT Services');
  const [companySize, setCompanySize] = useState('51-200');
  const [city, setCity] = useState('Bengaluru');
  const [state, setState] = useState('Karnataka');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('payroll');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tenantSlug = useMemo(() => workspace || slugify(companyName), [companyName, workspace]);
  const canSubmit = companyName.trim() && ownerName.trim() && ownerEmail.trim() && password.length >= 8 && tenantSlug;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_URL}/auth/signup`, {
        companyName,
        tenantSlug,
        legalName: legalName || companyName,
        industry,
        companySize,
        city,
        state,
        country: 'IN',
        ownerName,
        ownerEmail,
        password,
        primaryGoal,
      });
      invalidateTokenCache();
      const result = await signIn('credentials', {
        email: ownerEmail,
        password,
        tenantSlug,
        redirect: false,
      });
      if (result?.error) {
        router.push('/login');
        return;
      }
      router.push('/setup');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden bg-primary-950 px-12 py-10 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-base font-bold text-primary-800">
              {BRAND.initials}
            </span>
            <span className="text-lg font-semibold">{BRAND.name}</span>
          </div>

          <div className="mt-16 max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-300">Client onboarding</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight">Launch a payroll-ready workspace.</h1>
            <p className="mt-4 text-sm leading-6 text-primary-100">
              Create the client workspace, sign in as tenant owner, then continue into the implementation center for company setup, imports and payroll readiness.
            </p>
          </div>

          <div className="mt-12 space-y-4">
            {signupSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icon className="h-5 w-5 text-primary-200" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary-300">{index + 1}</span>
                      <p className="font-semibold">{step.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-primary-200">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-auto text-xs text-primary-300">Trial workspace. No payment step in this build.</p>
        </aside>

        <main className="flex items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-3xl">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="lg:hidden">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-800 text-sm font-bold text-white">{BRAND.initials}</span>
                  <span className="font-semibold">{BRAND.name}</span>
                </div>
              </div>
              <Link className="ml-auto text-sm font-semibold text-primary-700 hover:underline" href="/login">
                Sign in
              </Link>
            </div>

            <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-muted">Start trial</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Create client workspace</h2>
                  <p className="mt-2 max-w-xl text-sm text-ink-muted">
                    This creates the tenant owner account and sends you straight to setup.
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  India defaults
                </div>
              </div>

              <form onSubmit={onSubmit} className="mt-6 space-y-6">
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary-700" />
                    <h3 className="text-sm font-semibold">Company</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Company name</span>
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Acme India Pvt Ltd" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Workspace URL</span>
                      <Input
                        value={tenantSlug}
                        onChange={(e) => setWorkspace(slugify(e.target.value))}
                        required
                        placeholder="acme-india"
                      />
                      <span className="block text-xs text-ink-muted">{BRAND.workspaceBaseUrl.replace(/^https?:\/\//, '')}/{tenantSlug || 'workspace'}</span>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Legal name</span>
                      <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Same as company name" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Company size</span>
                      <Select value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                        {companySizes.map((size) => <option key={size}>{size}</option>)}
                      </Select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Industry</span>
                      <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="IT Services" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-sm font-medium">City</span>
                        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-sm font-medium">State</span>
                        <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Karnataka" />
                      </label>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary-700" />
                    <h3 className="text-sm font-semibold">Tenant owner</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Full name</span>
                      <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required placeholder="Priya Nair" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Work email</span>
                      <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="priya@acme.example" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Password</span>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Minimum 8 characters" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">First priority</span>
                      <Select value={primaryGoal} onChange={(e) => setPrimaryGoal(e.target.value)}>
                        {goals.map((goal) => <option key={goal.value} value={goal.value}>{goal.label}</option>)}
                      </Select>
                    </label>
                  </div>
                </section>

                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  <p className="max-w-md text-xs text-ink-muted">
                    After signup, continue in the implementation center to complete payroll readiness.
                  </p>
                  <Button type="submit" size="lg" disabled={!canSubmit || loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    Create workspace
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
