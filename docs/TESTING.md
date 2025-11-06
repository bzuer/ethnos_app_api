Ethnos API — Testing Guide

Overview
- Test runner: Jest
- Mode: Socket-free (no `app.listen`), safe for sandboxed CI
- Scope: Contract tests for key public endpoints with service mocks

How It Works
- Router invocation: tests call route handler chains directly via `tests/helpers/router-invoke.js`.
- Mock req/res: `tests/helpers/mock-express.js` provides minimal Express-like objects and plugs in the API’s `responseFormatter` so responses use the standard envelope.
- External deps: MariaDB and Redis connectivity are mocked at module level (`jest.mock('../src/config/database')`, `jest.mock('../src/config/redis')`) to avoid real connections.
- Services: Each test spies on the relevant service function and returns a small, shape-accurate payload; controllers and middleware are exercised end-to-end.

Run
- `npm test` runs in-band with `JEST_FAST=1` set.

Covered Endpoints
- Health: `GET /health/live`
- Works: `GET /works`, `GET /works/:id`
- Persons: `GET /persons`, `GET /persons/:id`
- Organizations: `GET /organizations`, `GET /organizations/:id`
- Venues: `GET /venues`
- Search: `GET /search/works`
- Citations: `GET /works/:id/citations`
- Collaborations: `GET /persons/:id/collaborators`
- Courses: `GET /courses`
- Instructors: `GET /instructors`
- Bibliography: `GET /bibliography`
- Security: `GET /security/stats` (with access key)

Notes
- Heavy and environment-dependent routes (e.g., Sphinx, dashboard aggregation) can be added by mocking their services similarly.
- The legacy Supertest-based tests are not run in CI due to sandbox socket restrictions; keep them for local dev if needed.

Add a New Endpoint Test
1) Identify the router and controller for the endpoint.
2) Stub the corresponding service call with a shape-accurate result.
3) Use `invokeRouter` with the correct `path` signature (e.g., `/:id`).
4) Assert the standardized envelope, pagination when applicable, and the expected data fields.

