'use client';

import { useEffect, useState } from 'react';

/** Punch is enabled once the fix accuracy radius is at or under this (meters). */
export const TARGET_ACCURACY_M = 50;
/** A fix older than this is considered stale and never submitted (ms). */
export const MAX_FIX_AGE_MS = 15_000;

export interface LiveFix {
  lat: number;
  lng: number;
  /** Accuracy radius in meters — lower is better. */
  accuracy: number;
  /** Epoch ms when the fix was captured by the GPS hardware. */
  timestamp: number;
}

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

/**
 * Live high-precision location stream. Uses watchPosition with
 * enableHighAccuracy and maximumAge: 0, so the browser is never allowed to
 * serve a cached ("last known") position — every fix comes from the sensor.
 * Successive fixes keep improving as the GPS warms up; the freshest fix wins
 * unless a still-fresh earlier fix is more accurate.
 */
export function useLiveLocation(active: boolean): {
  fix: LiveFix | null;
  status: GeoStatus;
  isPrecise: boolean;
  ageMs: number | null;
} {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      setFix(null);
      setStatus('idle');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: LiveFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setFix((prev) => {
          if (!prev) return next;
          const prevIsFresh = Date.now() - prev.timestamp < MAX_FIX_AGE_MS;
          return prevIsFresh && prev.accuracy < next.accuracy ? prev : next;
        });
        setStatus('ready');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(tick);
    };
  }, [active]);

  const ageMs = fix ? now - fix.timestamp : null;
  const isPrecise =
    !!fix && fix.accuracy <= TARGET_ACCURACY_M && ageMs !== null && ageMs < MAX_FIX_AGE_MS;
  return { fix, status, isPrecise, ageMs };
}

/**
 * One-shot precise capture for flows without live UI: streams fixes until one
 * reaches the target accuracy, or the deadline passes (then the best fresh
 * fix so far is returned; null if nothing usable arrived).
 */
export function captureFreshFix(maxWaitMs = 12_000): Promise<LiveFix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    let best: LiveFix | null = null;
    const finish = () => {
      clearTimeout(deadline);
      navigator.geolocation.clearWatch(watchId);
      resolve(best);
    };
    const deadline = setTimeout(finish, maxWaitMs);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const f: LiveFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        if (!best || f.accuracy <= best.accuracy) best = f;
        if (f.accuracy <= TARGET_ACCURACY_M) finish();
      },
      () => finish(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    );
  });
}
