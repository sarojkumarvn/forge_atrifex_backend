# Deployment Notes

This document describes deployment preparation only. It does not deploy the application.

## Environment Variables

Production must define:

- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`
- `GROQ_API_KEY`
- `AI_MODEL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `LOG_LEVEL`
- `ENABLE_REQUEST_LOGGING`

## Neon Database

Use a production Neon PostgreSQL connection string for `DATABASE_URL`. Keep test and production databases separate.

## Render Deployment

Typical Render configuration:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health/live`
- Readiness path for release validation: `/api/health/ready`

## Prisma Deployment Workflow

Run these commands before production startup:

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
```

## Production Checklist

- Confirm `NODE_ENV=production`
- Use strong `JWT_SECRET`
- Confirm all production-required environment variables are present
- Confirm `GITHUB_WEBHOOK_SECRET` is configured
- Configure GitHub OAuth callback URL to the production API
- Configure CORS with the production frontend origin
- Verify `/api/health/ready`
- Verify `/api/docs`
- Confirm logs are JSON and ingested by the host platform
- Confirm graceful shutdown is honored by the runtime
