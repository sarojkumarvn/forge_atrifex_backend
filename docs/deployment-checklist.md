# Deployment Checklist

Use this checklist for production release validation.

## Environment Setup

- Set `NODE_ENV=production`.
- Set `DATABASE_URL`.
- Set `JWT_SECRET` and `JWT_EXPIRES_IN`.
- Set `CLIENT_URL` to the production frontend origin.
- Set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and `AI_MODEL`.
- Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL`.
- Set `GITHUB_TOKEN_ENCRYPTION_KEY`.
- Set `GITHUB_WEBHOOK_SECRET`.
- Set `LOG_LEVEL=info` or the platform-approved production level.
- Confirm secrets are stored in the deployment platform secret manager, not in source control.

## Prisma Migration

- Run `npm install`.
- Run `npm run prisma:validate`.
- Run `npm run prisma:generate`.
- Run `npm run prisma:migrate:deploy`.
- Confirm migrations complete against the production database.

## Server Startup

- Start with `npm start`.
- Confirm missing required production variables fail startup.
- Confirm logs are JSON and include no secret values.
- Confirm graceful shutdown works on platform restarts.

## Health Endpoints

- Verify `GET /` returns the backend running response.
- Verify `GET /api/health/live` returns `200`.
- Verify `GET /api/health/ready` returns `200` after database, AI, and GitHub config are available.

## Swagger Verification

- Verify `GET /api/docs` renders Swagger UI.
- Verify `GET /api/docs.json` returns OpenAPI JSON.
- Verify protected endpoints show bearer authentication.

## AI Verification

- Call one AI endpoint with a valid bearer token and authorized role.
- Confirm the response is valid JSON and creates an `AIInsight`.
- Confirm `AIUsageMetric` records success or failure without storing secrets.
- Confirm failed provider calls return a safe error message.

## GitHub OAuth Verification

- Call `GET /api/github/connect` with a valid bearer token.
- Complete the GitHub callback flow.
- Confirm the GitHub token is encrypted at rest.
- Call `GET /api/github/repositories`.
- Link one repository to a project and confirm analytics endpoints respond.

## Organization Creation

- Register a new organization admin through `POST /api/auth/register`.
- Confirm the owner is created as `ADMIN`.
- Confirm `GET /api/organizations/me` returns the organization profile.

## Invite Flow

- Create an invite through `POST /api/organizations/invite`.
- Accept the invite through `POST /api/auth/accept-invite`.
- Confirm reused, revoked, expired, and wrong-email invite attempts fail.

## Dashboard Verification

- Verify admin dashboard endpoints with an admin token.
- Verify team-lead dashboard endpoints with a team lead token.
- Verify member dashboard endpoints with a member token.
- Confirm each role is blocked from dashboard endpoints reserved for other roles.

## Manual Smoke Checklist

- Login succeeds with valid credentials.
- Invalid login fails.
- Protected routes reject missing or invalid JWTs.
- JWTs issued before `JWT_INVALID_BEFORE` are rejected when the variable is set.
- Project, task, notification, activity, dashboard, report, AI, and GitHub smoke flows complete.
- GitHub webhook accepts a valid signed request.
- GitHub webhook rejects unsigned or invalidly signed requests in production.
