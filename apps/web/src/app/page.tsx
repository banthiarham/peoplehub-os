import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2, CheckCircle2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { authOptions } from '@/lib/auth';

const steps = [
  'Create the client tenant',
  'Create the tenant owner account',
  'Continue to guided setup',
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const roles = session.user.roles ?? [];
    redirect(roles.some((role) => role !== 'Employee') ? '/dashboard' : '/me');
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex flex-col bg-primary-950 px-6 py-8 text-white sm:px-10 lg:px-12">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-base font-bold text-primary-800">
              PH
            </span>
            <span className="text-lg font-semibold">
              PeopleHub <span className="font-normal text-primary-300">OS</span>
            </span>
          </div>

          <div className="my-auto max-w-xl py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-300">
              India-first HRMS
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl">
              Start with your workspace.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-primary-100">
              Sign in to an existing company or create a new client tenant with its first admin account.
            </p>

            <div className="mt-10 space-y-4">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold ring-1 ring-white/15">
                    {index + 1}
                  </span>
                  <span className="text-sm text-primary-100">{step}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-primary-300">Trial signup creates a tenant owner account and redirects to setup.</p>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-xl">
            <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-start gap-4 border-b border-line pb-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-muted">Welcome</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">Choose how to continue</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    Existing users sign in. New clients create a tenant and first admin account.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Link
                  href="/login"
                  className="group rounded-lg border border-line bg-white p-5 shadow-sm transition hover:border-primary-200 hover:bg-canvas"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <LogIn className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">Sign in</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    Use your existing PeopleHub workspace account.
                  </p>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
                    Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>

                <Link
                  href="/signup"
                  className="group rounded-lg border border-primary-200 bg-primary-50 p-5 shadow-sm transition hover:border-primary-300 hover:bg-primary-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-700 text-white">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">Sign up</h3>
                  <p className="mt-2 text-sm leading-6 text-primary-900/70">
                    Create a client tenant and the first tenant owner account.
                  </p>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-800">
                    Create workspace <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              </div>

              <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">What signup does</p>
                    <div className="mt-3 grid gap-2 text-sm text-emerald-900/75">
                      {steps.map((step) => (
                        <div key={step} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
