'use client';

import axios from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRAND } from '@/config/brand';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

function apiMessage(error: unknown) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? 'Could not send reset email. Try again.';
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setSent(false);
    setError('');
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email }, { timeout: 15000 });
      setSent(true);
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
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Enter your work email and we will send a secure reset link.
        </p>

        {sent ? (
          <div className="mt-8 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
            <div>
              <p className="font-semibold">Check your inbox</p>
              <p className="mt-1">
                If an active account exists for <span className="font-semibold">{email}</span>, a secure
                reset link has been sent. The link expires in 1 hour.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary-900/10 hover:bg-primary-800"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Work email</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {loading && (
              <div className="rounded-xl border border-primary-100 bg-primary-50 p-3 text-sm text-primary-900">
                Sending reset instructions to {email || 'this email'}...
              </div>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
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
