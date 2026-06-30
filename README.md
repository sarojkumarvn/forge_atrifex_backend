# Forge AtriFex Backend

Forge AtriFex Backend is the API platform for an AI-powered project management system with team collaboration, analytics, reports, GitHub integration, and AI insights.

## Features

- JWT authentication
- Role-based access control
- Organization-scoped teams, projects, and tasks
- Notifications and activity timeline
- Dashboard analytics by role
- Operational reports and executive summaries
- AI project analysis, risk analysis, team analysis, and task suggestions
- GitHub OAuth, repository linking, and repository analytics
- Zod request validation
- Standardized error handling
- Structured logging, request IDs, health checks, and graceful shutdown
- Lightweight in-memory caching for expensive summaries
- Swagger/OpenAPI documentation

## Tech Stack

- Node.js
- Express.js
- Prisma
- PostgreSQL
- Zod
- Pino
- NodeCache
- Swagger UI / OpenAPI 3.0

## Architecture

The API is organized by route, controller, service, middleware, validator, and utility layers.

See [docs/architecture.md](docs/architecture.md).

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The server defaults to:

```txt
http://localhost:5000
```

## API Documentation

Swagger UI:

```txt
http://localhost:5000/api/docs
```

OpenAPI JSON:

```txt
http://localhost:5000/api/docs.json
```

## Environment Variables

See [.env.example](.env.example). Required production values include:

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

## Database

Validate the Prisma schema:

```bash
npx prisma validate
```

Use a dedicated PostgreSQL database for each environment.

## Manual Verification

Use [docs/manual-testing.md](docs/manual-testing.md) for the current product QA checklist.

## Deployment Notes

Production deployments should configure JSON log ingestion, health checks, readiness checks, CORS, GitHub OAuth callback URL, and secrets through the hosting provider.

See [docs/deployment.md](docs/deployment.md).

## Developer Documentation

- [Setup](docs/setup.md)
- [Architecture](docs/architecture.md)
- [Authentication](docs/authentication.md)
- [Deployment](docs/deployment.md)
- [Manual Testing](docs/manual-testing.md)
- [API Overview](docs/api-overview.md)
