# PeopleHub OS

> AI-first People Operating System — HRMS, Payroll, Attendance, Hiring, Performance, Analytics, and Developer API Platform.

## Architecture

```
peoplehub-os/
├── apps/
│   ├── web/         # Next.js 14 frontend (admin, HR, payroll, manager, employee portals)
│   └── api/         # NestJS backend (REST API, job queues, webhooks)
├── packages/
│   ├── database/    # Prisma schema + migrations + seed (PostgreSQL)
│   ├── types/       # Shared TypeScript types
│   └── ui/          # Shared React component library (shadcn/ui based)
├── docker-compose.yml
└── .github/workflows/
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, Fastify, TypeScript, REST APIs |
| Database | PostgreSQL 16, Prisma ORM |
| Cache/Queue | Redis 7, BullMQ |
| File Storage | S3-compatible (MinIO for local dev) |
| Auth | NextAuth.js, JWT, Google OAuth, Azure AD |
| Monorepo | Turborepo, npm workspaces |
| CI/CD | GitHub Actions |
| Container | Docker + Docker Compose |

## Modules

| # | Module |
|---|--------|
| 1 | Organization & Tenant Management |
| 2 | Core HR & Employee Master |
| 3 | Roles, Permissions & Access Control |
| 4 | Employee Self-Service Portal |
| 5 | Time, Attendance, Leave & Shift Management |
| 6 | Payroll & Compliance Engine (India-first) |
| 7 | Expense, Claims, Loans & Advances |
| 8 | Recruitment & ATS |
| 9 | Onboarding & Offboarding |
| 10 | Performance, Goals, OKRs & Reviews |
| 11 | Engagement, Culture, Surveys & Recognition |
| 12 | HR Helpdesk & Knowledge Base |
| 13 | Assets & Inventory |
| 14 | Timesheets, Projects & PSA |
| 15 | Analytics & Workforce Intelligence |
| 16 | AI Copilot (Employee, HR, Payroll, Manager, Recruiter) |
| 17 | Developer Ecosystem, APIs & Integrations |
| 18 | Workflow & Approval Engine |
| 19 | Forms, Documents & Letter Builder |
| 20 | Notifications & Communication |
| 21 | Security, Privacy & Audit |

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker & Docker Compose
- Git

### 1. Clone & install

```bash
git clone https://github.com/banthiarham/peoplehub-os.git
cd peoplehub-os
cp .env.example .env
npm install
```

### 2. Start infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- MinIO (S3) on `localhost:9000` (console: `localhost:9001`)
- MailHog (email) on `localhost:1025` (UI: `localhost:8025`)

### 3. Set up database

```bash
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Run migrations
npm run db:seed         # Load demo data
```

### 4. Run development servers

```bash
npm run dev
```

- Web app: http://localhost:3000
- API: http://localhost:3001
- API docs: http://localhost:3001/api/docs
- DB Studio: `npm run db:studio`

### Demo Credentials

| Role | Email |
|------|-------|
| Super Admin | admin@democorp.com |
| HR Admin | hr@democorp.com |
| Payroll Admin | payroll@democorp.com |

### Environment Variables

Copy `.env.example` to `.env` and fill in your values. All variables are documented in `.env.example`.

## Database Schema

The database contains **66+ entities** covering all HRMS modules. See `packages/database/prisma/schema.prisma` for the full schema.

Key design decisions:
- **Multi-tenancy**: `tenant_id` on every business table with RLS-ready indexes
- **Audit trail**: `AuditLog` captures actor, action, old/new values, IP, and timestamp for every sensitive change
- **India-first payroll**: Statutory components (PF, ESI, PT, TDS, LWF, Gratuity) built into `SalaryComponent`
- **Event-driven webhooks**: `WebhookSubscription` + `WebhookDelivery` with retry logic

## API

REST API with OpenAPI docs at `/api/docs`.

Authentication: Bearer JWT or `X-API-Key` header.

Key endpoint groups:
- `/api/v1/employees` — Employee master CRUD
- `/api/v1/attendance` — Punch, import, exceptions
- `/api/v1/leave` — Balances, requests, approvals
- `/api/v1/payroll` — Runs, payslips, components
- `/api/v1/workflows` — Approval engine
- `/api/v1/developer` — API keys, webhooks, OAuth apps

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Proprietary. All rights reserved.
