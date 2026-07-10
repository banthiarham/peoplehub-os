'use client';

import { getSession, signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRAND } from '@/config/brand';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@democorp.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const resetStatus = new URLSearchParams(window.location.search).get('reset');
    if (resetStatus === 'success') {
      setNotice('Password changed. Sign in with your new password.');
      window.history.replaceState(null, '', '/login');
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError('Invalid email or password');
    } else {
      const session = await getSession();
      const roles = session?.user?.roles ?? [];
      const isAdmin = roles.some((r) => r !== 'Employee');
      router.push(isAdmin ? '/dashboard' : '/me');
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary-950 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-base font-bold text-primary-800">
            {BRAND.initials}
          </span>
          <span className="text-lg font-semibold text-white">{BRAND.name}</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight text-white">
            The people platform for modern India.
          </h1>
          <p className="mt-4 max-w-md text-primary-200">
            Payroll, attendance, hiring, performance and an AI copilot — one system your whole
            company runs on.
          </p>
        </div>
        <p className="text-sm text-primary-400">{BRAND.copyright}</p>
      </div>
      <div className="flex w-full items-center justify-center p-8 lg:w-1/2">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-muted">Sign in to your workspace</p>
          {notice && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {notice}
            </div>
          )}
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Work email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">Password</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-primary-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-ink-muted">
            New client?{' '}
            <Link href="/signup" className="font-semibold text-primary-700 hover:underline">
              Create a workspace
            </Link>
          </p>
          <div className="mt-6 rounded-xl border border-line bg-canvas p-4 text-xs text-ink-muted">
            <p className="font-medium text-ink">Demo credentials</p>
            <p className="mt-1">admin@democorp.com · hr@democorp.com · payroll@democorp.com</p>
            <p>employee@democorp.com — self-service portal</p>
            <p>
              Password: <code className="rounded bg-white px-1 py-0.5">Demo@123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
