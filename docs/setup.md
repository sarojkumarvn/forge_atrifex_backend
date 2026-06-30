# Setup Guide

## Requirements

- Node.js 20+
- npm
- PostgreSQL-compatible database, such as Neon
- Prisma CLI through project scripts or `npx prisma`
- GitHub OAuth app credentials for GitHub integration
- Groq API key for AI services

## Installation

```bash
npm install
```

## Environment Variables

Create `.env` from `.env.example` and fill the required values:

```env
DATABASE_URL=""
JWT_SECRET=""
CLIENT_URL="http://localhost:5173"
GROQ_API_KEY=""
AI_MODEL="llama-3.3-70b-versatile"
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GITHUB_CALLBACK_URL=""
GITHUB_TOKEN_ENCRYPTION_KEY=""
LOG_LEVEL="info"
ENABLE_REQUEST_LOGGING="true"
```

Do not commit real secrets.

## Database Setup

Validate the Prisma schema:

```bash
npx prisma validate
```

Apply migrations according to your environment workflow. For local development, use the project migration strategy already established by the team.

## Prisma Setup

The app uses Prisma with the PostgreSQL adapter. The backend expects `DATABASE_URL` at startup and refuses to start without it.

## Running Locally

```bash
npm run dev
```

The API defaults to:

```txt
http://localhost:5000
```

Swagger UI is available at:

```txt
http://localhost:5000/api/docs
```
