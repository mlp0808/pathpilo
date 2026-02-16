# PathPilo

## Local development

### Prerequisites
- Node.js 18+
- PostgreSQL

### Environment
Copy `env.example` to `.env` and fill in DB credentials.

### Email Setup (Optional)
For email notifications (invoices, lead submissions):

1. **Resend (Recommended)** - Free tier, easy setup:
   - Sign up at [resend.com](https://resend.com)
   - Get API key from dashboard
   - Add `RESEND_API_KEY=re_xxx...` to `.env`

2. **SMTP (Alternative)** - Configure SMTP settings in `.env`

Without email config, emails log to console (development) or fail silently (production).

### Run (frontend + API)
```bash
npm install
npm run db:reset
npm run dev:fullstack
```

- Frontend (Next.js): `http://localhost:3000`
- API (Express): `http://localhost:3003`

## Database setup

Single setup script:
```bash
# Create tables (non-destructive) + seed if empty
npm run db:setup

# Drop/recreate tables (DESTRUCTIVE) + seed
npm run db:reset
```

## Production
See `DEPLOYMENT.md` (ports: Next.js 3002, API 3003).


