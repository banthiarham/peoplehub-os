import { BottomNav } from '@/components/portal/bottom-nav';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-md px-4 pb-24 pt-5">{children}</div>
      <BottomNav />
    </div>
  );
}
