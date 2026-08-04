import { BottomNav } from '@/components/portal/bottom-nav';
import { InstallPrompt } from '@/components/pwa/install-prompt';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-md px-4 pb-24 pt-5">{children}</div>
      {/* No header in the portal, so it floats from the top edge at every width. */}
      <InstallPrompt className="inset-x-4 top-4 md:left-auto md:right-6 md:w-[380px]" />
      <BottomNav />
    </div>
  );
}
