'use client';

import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRAND } from '@/config/brand';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

function apiMessage(error: unknown) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? 'Could not reset password. Try again.';
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { token, newPassword: password }, { timeout: 15000 });
      setDone(true);
      window.setTimeout(() => {
        router.replace('/login?reset=success');
      }, 1200);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-8 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-700 text-base font-bold text-white">
            {BRAND.initials}
          </span>
          <span className="text-lg font-semibold">{BRAND.name}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">Use the reset link from your email.</p>

        {done ? (
          <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Your password has been changed. Taking you back to sign in...
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {!token && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                This reset link is missing a token. Request a new password reset email.
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium">New password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {loading && (
              <div className="rounded-xl border border-primary-100 bg-primary-50 p-3 text-sm text-primary-900">
                Saving your new password...
              </div>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !token || password.length < 8}>
              {loading ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-ink-muted">
          <Link href="/login" className="font-semibold text-primary-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
