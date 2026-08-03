import { BottomNav } from '@/components/portal/bottom-nav';
import { InstallPrompt } from '@/components/pwa/install-prompt';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-md px-4 pb-24 pt-5">{children}</div>
      {/* No fixed header here, so it floats from the top of the viewport. */}
      <InstallPrompt className="inset-x-4 top-4 mx-auto max-w-[460px]" />
      <BottomNav />
    </div>
  );
}
