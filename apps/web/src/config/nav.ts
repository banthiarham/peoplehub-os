import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Clock,
  Code2,
  HeartHandshake,
  Laptop,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Network,
  ReceiptText,
  Settings,
  Sparkles,
  Target,
  Timer,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', href: '/employees', icon: Users },
      { label: 'Attendance', href: '/attendance', icon: Clock },
      { label: 'Leave', href: '/leave', icon: CalendarDays },
      { label: 'Onboarding', href: '/onboarding', icon: UserPlus },
      { label: 'Org Chart', href: '/org', icon: Network },
    ],
  },
  {
    title: 'Pay',
    items: [
      { label: 'Payroll', href: '/payroll', icon: Wallet },
      { label: 'Tax Engine', href: '/tax', icon: ReceiptText },
    ],
  },
  {
    title: 'Talent',
    items: [
      { label: 'Recruitment', href: '/recruitment', icon: Briefcase },
      { label: 'Performance', href: '/performance', icon: Target },
      { label: 'Engagement', href: '/engagement', icon: HeartHandshake },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Helpdesk', href: '/helpdesk', icon: LifeBuoy },
      { label: 'Assets', href: '/assets', icon: Laptop },
      { label: 'Timesheets', href: '/timesheets', icon: Timer },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Communications', href: '/communications', icon: Mail },
      { label: 'Developer', href: '/developer', icon: Code2 },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];
