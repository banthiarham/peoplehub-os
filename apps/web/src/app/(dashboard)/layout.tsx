import { CommandPaletteProvider } from '@/components/command-palette';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <div className="min-h-screen bg-canvas">
        <Sidebar />
        <div className="lg:pl-72">
          <Topbar />
          <main className="mx-auto max-w-[1640px] px-4 py-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
