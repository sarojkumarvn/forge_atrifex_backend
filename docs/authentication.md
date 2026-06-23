# Authentication and Authorization

## JWT Flow

Users register or login through:

```txt
POST /api/auth/register
POST /api/auth/login
```

Successful responses include a JWT token. Protected requests must send:

```http
Authorization: Bearer <token>
```

## Roles

Forge AtriFex supports:

- `ADMIN`
- `TEAM_LEAD`
- `TEAM_MEMBER`

## Organization Model

All users belong to an organization. Queries are scoped by `organizationId` so teams, projects, tasks, reports, notifications, and analytics do not leak across tenants.

## RBAC Rules

- `ADMIN`: organization administration, teams, projects, reports, dashboards, role management
- `TEAM_LEAD`: led-team projects, team analytics, task creation and reassignment where permitted
- `TEAM_MEMBER`: assigned work, personal notifications, scoped project/task/report visibility

## Protected Routes

Most `/api/*` endpoints require JWT authentication. Swagger marks protected endpoints with the `bearerAuth` security scheme.
