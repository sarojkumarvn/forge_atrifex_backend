# Manual Testing Guide

Use this checklist while automated tests are intentionally removed during rapid product development.

## Prerequisites

- Install dependencies with `npm install`.
- Configure `.env` from `.env.example` with a development database, JWT secret, AI keys, and GitHub OAuth credentials.
- Apply the current Prisma migrations for the development database.
- Start the backend with `npm run dev`.
- Keep Swagger open at `http://localhost:5000/api/docs`.

## Health And Documentation

- Open `GET /` and confirm the backend running response.
- Open `GET /api/health/live` and confirm liveness succeeds.
- Open `GET /api/health/ready` and confirm database readiness succeeds.
- Open `GET /api/docs` and confirm Swagger renders.
- Open `GET /api/docs.json` and confirm valid OpenAPI JSON is returned.

## Authentication

- Register a new organization and first admin through `POST /api/auth/register`.
- Confirm the response returns a JWT and safe user fields only.
- Call `GET /api/auth/me` with the JWT and confirm the current user is returned.
- Call a protected route without a token and confirm it returns unauthorized.
- Call `POST /api/auth/logout` and confirm a successful response.

## Organization Creation

- Confirm registration creates an organization owned by the first admin.
- Call `GET /api/organizations/me` as admin and verify organization profile data.
- Update organization profile with `PATCH /api/organizations/me`.
- Update organization settings with `PATCH /api/organizations/settings`.

## Invitation Acceptance

- As admin, create an invite with `POST /api/organizations/invite`.
- Confirm the invite appears in `GET /api/organizations/invites`.
- Accept the invite with `POST /api/auth/accept-invite` using the invited email and token.
- Confirm reused, revoked, expired, or wrong-email invites are rejected.

## Login

- Login with valid credentials through `POST /api/auth/login`.
- Confirm invalid password attempts fail.
- Confirm inactive or removed users cannot continue accessing protected organization routes.

## Project CRUD

- As admin, create a project with `POST /api/projects`.
- List projects with `GET /api/projects` and verify organization scoping.
- Fetch a project with `GET /api/projects/:id`.
- Update a project with `PATCH /api/projects/:id`.
- Assign a team with `POST /api/projects/:id/assign-team`.
- Delete only projects that satisfy current business rules.

## Task CRUD

- As admin or team lead, create a task with `POST /api/tasks`.
- List tasks with `GET /api/tasks` and verify role-based visibility.
- Fetch a task with `GET /api/tasks/:id`.
- Update task details with `PATCH /api/tasks/:id`.
- Update status with `PATCH /api/tasks/:id/status`.
- Update progress with `PATCH /api/tasks/:id/progress`.
- Reassign a task with `PATCH /api/tasks/:id/reassign`.
- Delete only tasks permitted by role and ownership rules.

## Notification Flow

- Create or reassign a task and confirm the recipient receives a notification.
- List notifications with `GET /api/notifications`.
- Confirm unread count with `GET /api/notifications/unread-count`.
- Mark one notification read with `PATCH /api/notifications/:id/read`.
- Mark all notifications read with `PATCH /api/notifications/read-all`.

## Dashboard

- As admin, verify `GET /api/dashboard/admin`.
- As admin, verify delivery health and contribution analytics endpoints.
- As team lead, verify team lead summary, analytics, and issue views.
- As team member, verify member summary, activity, and performance views.
- Confirm each role cannot access dashboard routes reserved for other roles.

## Reports

- Generate project report with `GET /api/reports/project/:projectId`.
- Generate team report with `GET /api/reports/team/:teamId`.
- Generate member report with `GET /api/reports/member/:memberId`.
- Generate admin-only delivery and executive summary reports.
- Confirm cross-organization report access is blocked.

## AI Endpoints

- Verify AI configuration is present in `.env`.
- Run project analysis with `POST /api/ai/project-analysis/:projectId`.
- Run risk analysis with `POST /api/ai/risk-analysis/:projectId`.
- Run team analysis with `POST /api/ai/team-analysis/:teamId`.
- Run task suggestions with `POST /api/ai/task-suggestions/:projectId`.
- Run executive summary with `POST /api/ai/executive-summary`.
- Confirm unauthorized roles cannot call restricted AI endpoints.

## GitHub Integration

- Open `GET /api/github/connect` as an authenticated user and confirm OAuth redirect data.
- Complete the OAuth callback flow with configured GitHub credentials.
- Confirm repositories load from `GET /api/github/repositories`.
- Link a repository to a project with `POST /api/github/connect-repository`.
- Verify project repository overview, commits, contributors, issues, and pull request analytics.
- Confirm unconnected users receive a safe error when repository data is requested.

## Swagger

- Confirm every major route group appears in Swagger.
- Try at least one authenticated endpoint from Swagger using a bearer token.
- Confirm request schemas reject invalid enum values and malformed UUIDs.

## Final Smoke Pass

- Restart the server and confirm it boots cleanly.
- Confirm logs include request IDs and no secrets.
- Confirm CORS allows the configured `CLIENT_URL`.
- Confirm Prisma readiness passes against the configured development database.
