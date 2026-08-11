'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { captureFreshFix } from '@/lib/geo';

/**
 * Outside the authenticated layouts on purpose: a wall-mounted tablet has no
 * one to keep signed in, so it pairs once and then uses its own display token.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const TOKEN_KEY = 'peoplehub.qrDisplayToken';

interface Paired {
  token: string;
  locationName: string | null;
  name: string;
  verifyLocation: boolean;
  rotateMs: number;
}

/**
 * The whole pairing is persisted, not just the token: a display that forgot
 * `verifyLocation` across a reload would be refused every code it asked for.
 */
function readStoredPairing(): Paired | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Paired>;
    return parsed?.token ? ({ rotateMs: 10_000, ...parsed } as Paired) : null;
  } catch {
    return null;
  }
}

function writeStoredPairing(paired: Paired): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, JSON.stringify(paired));
  } catch {
    // A locked-down kiosk browser still works for this session.
  }
}

function apiError(err: unknown): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? 'Something went wrong');
}

export default function QrDisplayPage() {
  const [paired, setPaired] = useState<Paired | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState<number | null>(null);
  const [expiresInMs, setExpiresInMs] = useState<number | null>(null);

  useEffect(() => {
    setPaired(readStoredPairing());
  }, []);

  const pair = async () => {
    setPairing(true);
    setError(null);
    try {
      const { data } = await axios.post<Paired>(`${API_BASE}/attendance/qr/display/pair`, {
        pairingCode: pairingCode.trim(),
      });
      writeStoredPairing(data);
      setPaired(data);
      setPairingCode('');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setPairing(false);
    }
  };

  const refresh = useCallback(async () => {
    if (!paired) return;
    try {
      // Only when it has to prove it is on site: a screen that never moves
      // should not be prompted for location every ten seconds.
      const fix = paired.verifyLocation ? (await captureFreshFix(8_000)).fix : null;
      const { data } = await axios.post<{ token: string; expiresInMs: number }>(
        `${API_BASE}/attendance/qr/display/token`,
        fix ? { geoLat: fix.lat, geoLng: fix.lng, geoAccuracy: fix.accuracy } : {},
        { headers: { 'x-display-token': paired.token } },
      );
      setQrDataUrl(
        await QRCode.toDataURL(data.token, { errorCorrectionLevel: 'M', margin: 1, width: 640 }),
      );
      setIssuedAt(Date.now());
      // From the response, not restated here: a screen that disagreed would
      // either show dead codes or blank a working one.
      setExpiresInMs(data.expiresInMs);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  }, [paired]);

  useEffect(() => {
    if (!paired) return;
    void refresh();
    const timer = setInterval(() => void refresh(), paired.rotateMs || 10_000);
    return () => clearInterval(timer);
  }, [paired, refresh]);

  // A frozen tab would otherwise show a dead code indefinitely.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const stale = issuedAt != null && expiresInMs != null && now - issuedAt > expiresInMs;

  const unpair = () => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clean up.
    }
    setPaired(null);
    setQrDataUrl(null);
    setIssuedAt(null);
    setExpiresInMs(null);
  };

  if (!paired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-lg font-semibold">Pair this display</h1>
          <p className="mt-1 text-sm text-slate-400">
            Enter the pairing code from Settings → Locations → QR display.
          </p>
          <input
            className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center text-2xl uppercase tracking-[0.3em] outline-none focus:border-slate-500"
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value)}
            placeholder="A1B2C3D4"
            maxLength={12}
            autoFocus
          />
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <button
            className="mt-4 w-full rounded-lg bg-white px-4 py-2 font-medium text-slate-950 disabled:opacity-50"
            disabled={pairing || pairingCode.trim().length < 4}
            onClick={() => void pair()}
          >
            {pairing ? 'Pairing…' : 'Pair display'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        {paired.locationName ?? paired.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">Scan to check in</p>

      <div className="relative mt-6">
        {qrDataUrl ? (
          // A plain img, not next/image: a data: URI regenerated every ten
          // seconds is nothing the optimizer can help with.
          <img
            src={qrDataUrl}
            alt="Attendance QR code"
            width={360}
            height={360}
            className={stale ? 'opacity-20 blur-sm transition' : 'transition'}
          />
        ) : (
          <div className="h-[360px] w-[360px] animate-pulse rounded-lg bg-slate-100" />
        )}
        {stale && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
              Code is out of date — check this display&apos;s connection
            </p>
          </div>
        )}
      </div>

      {error && <p className="mt-4 max-w-md text-center text-sm text-red-600">{error}</p>}
      <p className="mt-6 text-xs text-slate-400">
        Refreshes automatically ·{' '}
        <button className="underline" onClick={unpair}>
          Unpair
        </button>
      </p>
    </main>
  );
}
