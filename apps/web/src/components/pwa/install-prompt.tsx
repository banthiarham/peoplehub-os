'use client';

import { X } from 'lucide-react';
import { useInstallPrompt } from '@/components/pwa/use-install-prompt';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/config/brand';
import { cn } from '@/lib/utils';

/**
 * Dismissible "Install VioHr" banner, floating at the top of the viewport.
 *
 * Renders nothing until the browser confirms VioHr is installable, and nothing at all
 * once it is installed or running standalone. Browsers with no install API get the
 * documented manual steps instead of a dead button.
 *
 * `className` carries the positioning so each shell can clear its own chrome — the
 * dashboard sits below a sticky top bar, the portal has none. It is fixed rather than
 * in flow so appearing never reflows the page underneath it.
 */
export function InstallPrompt({ className }: { className?: string }) {
  const { isBannerVisible, hasNativePrompt, manualInstructions, promptInstall, dismiss } =
    useInstallPrompt();

  if (!isBannerVisible) return null;

  const showManualSteps = Boolean(manualInstructions) && !hasNativePrompt;

  return (
    <div
      role="region"
      aria-label={`Install ${BRAND.name}`}
      className={cn(
        'fixed z-40 animate-slide-down-fade rounded-2xl border border-line bg-card p-4 shadow-lg motion-reduce:animate-none',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Decorative: the adjacent heading already names the app. */}
        <img
          src="/icons/pwa/icon-192x192.png"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-xl border border-line/70"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {showManualSteps ? manualInstructions?.title : `Install ${BRAND.name}`}
          </p>

          {showManualSteps ? (
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-5 text-ink-muted">
              {manualInstructions?.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">
              Add {BRAND.name} to your device for faster access.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            {hasNativePrompt && (
              <Button size="sm" onClick={() => void promptInstall()}>
                Install
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={dismiss}>
              {hasNativePrompt ? 'Not now' : 'Got it'}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-ink-faint hover:bg-canvas hover:text-ink-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
