# Testing

## Running Tests

```bash
npm test
```

The test runner requires:

```env
TEST_DATABASE_URL=""
```

The suite refuses to run against `DATABASE_URL` to avoid damaging development or production data.

## Coverage Reports

```bash
npm run test:coverage
```

Coverage output is generated locally and should not be committed.

## Test Database

Use an isolated PostgreSQL database. The test helpers reset data before seeding known organizations, users, teams, projects, tasks, notifications, and activity logs.

## Mocking AI

AI-provider tests should mock provider calls and avoid sending prompts or real requests to external services.

## Mocking GitHub

GitHub tests should mock OAuth and API responses. Do not use real OAuth tokens or repository API calls in automated tests.
