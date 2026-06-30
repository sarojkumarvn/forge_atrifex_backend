# API Overview

## Major Modules

- Authentication and RBAC
- Organizations and invites
- Teams
- Projects
- Tasks
- Notifications
- Activity timeline
- Dashboard analytics
- Reports
- AI insights
- GitHub integration
- Health, observability, and operational readiness

## Endpoint Groups

Interactive documentation is available at:

```txt
/api/docs
```

The raw OpenAPI document is available at:

```txt
/api/docs.json
```

## Request Flow

1. Request ID middleware attaches `X-Request-Id`.
2. Request logging records sanitized request metadata.
3. Rate limits protect authentication, AI, GitHub, and general API routes.
4. Auth middleware validates JWT for protected routes.
5. RBAC middleware checks role permissions.
6. Zod validation parses body, params, and query.
7. Controllers call services and return standardized JSON.
8. Errors flow through centralized error middleware.

## Response Format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Validation error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "body.email",
      "message": "Invalid email address"
    }
  ]
}
```

Auth errors:

```json
{
  "success": false,
  "message": "Unauthorized"
}
```
