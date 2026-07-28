import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Code2,
  Bell,
  FileText,
  HeartHandshake,
  Laptop,
  LayoutDashboard,
  ListChecks,
  LifeBuoy,
  Mail,
  Network,
  ReceiptText,
  Settings,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { allows, type CapabilityName, type Viewer } from '@/lib/authz';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Capability required to see this entry. Omitted means "everyone with a session".
   * The API still enforces access; this only avoids dead navigation.
   */
  capability?: CapabilityName;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Copilot', href: '/copilot', icon: Sparkles },
      { label: 'Approvals', href: '/approvals', icon: ClipboardCheck },
      { label: 'Workflows', href: '/workflows', icon: Network },
      { label: 'Reports', href: '/reports', icon: BarChart3, capability: 'reports' },
      { label: 'My Portal', href: '/me', icon: Smartphone },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', href: '/employees', icon: Users, capability: 'employees' },
      { label: 'Attendance', href: '/attendance', icon: Clock, capability: 'attendance' },
      { label: 'Leave', href: '/leave', icon: CalendarDays, capability: 'leave' },
      { label: 'Onboarding', href: '/onboarding', icon: UserPlus, capability: 'onboarding' },
      { label: 'Org Chart', href: '/org', icon: Network, capability: 'organization' },
    ],
  },
  {
    title: 'Pay',
    items: [
      { label: 'Payroll', href: '/payroll', icon: Wallet, capability: 'payroll' },
      { label: 'Tax Engine', href: '/tax', icon: ReceiptText, capability: 'tax' },
    ],
  },
  {
    title: 'Talent',
    items: [
      { label: 'Recruitment', href: '/recruitment', icon: Briefcase, capability: 'recruitment' },
      { label: 'Performance', href: '/performance', icon: Target, capability: 'performance' },
      { label: 'Engagement', href: '/engagement', icon: HeartHandshake, capability: 'engagement' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Helpdesk', href: '/helpdesk', icon: LifeBuoy },
      { label: 'Assets', href: '/assets', icon: Laptop, capability: 'assets' },
      { label: 'Timesheets', href: '/timesheets', icon: Timer, capability: 'timesheets' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Documents', href: '/documents', icon: FileText },
      { label: 'Setup', href: '/setup', icon: ListChecks, capability: 'setup' },
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Communications', href: '/communications', icon: Mail, capability: 'communications' },
      { label: 'Developer', href: '/developer', icon: Code2, capability: 'developer' },
      { label: 'Settings', href: '/settings', icon: Settings, capability: 'settings' },
    ],
  },
];

/**
 * The navigation a viewer should actually see. Sections left with no visible item are
 * dropped entirely so no empty section header is rendered.
 */
export function visibleNavSections(viewer: Viewer): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.capability || allows(viewer, item.capability)),
  })).filter((section) => section.items.length > 0);
}
