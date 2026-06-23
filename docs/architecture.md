# Architecture

Forge AtriFex Backend is a layered Express API.

## Folder Structure

```txt
src/
  config/        Environment, Prisma, logger, Swagger
  controllers/   HTTP request handlers
  middleware/    Auth, RBAC, validation, errors, tracing, logging
  routes/        Route registration by API domain
  services/      Business workflows, reports, analytics, AI, GitHub
  utils/         Shared helpers, errors, metrics, shutdown, safe user formatting
  validators/    Zod request schemas by domain
```

## Controllers

Controllers keep HTTP concerns thin: read validated input, call services or Prisma-backed workflows, and return standardized responses.

## Services

Services hold cross-query workflows such as dashboard analytics, report generation, AI context building, and GitHub analytics.

## Middleware

Important middleware includes:

- JWT authentication
- Role-based access control
- Zod validation
- Request ID propagation
- Pino request logging
- Centralized error handling
- Rate limiting

## Validators

Request validation is centralized under `src/validators`. Route handlers should not accept unchecked body, params, or query input.

## Observability

The API uses structured Pino logs, `X-Request-Id`, request duration metrics, readiness/liveness endpoints, and graceful shutdown handling.

## Caching

`src/services/cache.service.js` provides lightweight in-memory caching for dashboard summaries, reports, GitHub analytics, and AI context snapshots. TTLs are intentionally short and suitable for a single-process MVP.
