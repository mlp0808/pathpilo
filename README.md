# Vevago

## Local development

### Prerequisites
- Node.js 18+
- PostgreSQL

### Environment
Copy `env.example` to `.env` and fill in DB credentials.

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


