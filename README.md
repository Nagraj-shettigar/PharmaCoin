# HealthPoints

Offline-first pharmacy loyalty & billing app. **Angular** SPA (frontend) + **Express/TypeScript + Postgres** API (backend), designed to sync local-first data to a backend when available.

## Monorepo layout

```
.
├── src/                 # Angular frontend (SPA)
├── backend/             # Express API (TypeScript, Postgres, Zod)
│   ├── migrations/      # SQL migrations (001_*, 002_*)
│   └── src/
├── .env.example         # Env-var reference for the whole repo
└── README.md
```

## Quickstart (local dev)

```bash
# 1. Frontend
npm install
npm start                 # ng serve → http://localhost:4200

# 2. Backend (separate terminal)
npm run backend:install   # installs backend deps
cp backend/.env.example backend/.env   # then edit DATABASE_URL
npm run backend:migrate   # apply SQL migrations
npm run backend:dev       # tsx watch → http://localhost:4000
```

Root convenience scripts: `backend:install`, `backend:dev`, `backend:build`, `backend:migrate`, `build:all`.

## Environments

Two environments are driven by git branches: **`develop` → dev**, **`main` → prod**.

| Concern | Dev | Prod |
|---|---|---|
| Frontend build | `ng build -c development` | `ng build -c production` |
| Frontend host | Cloudflare Pages (preview) | Cloudflare Pages (production) |
| API base URL | from `src/environments/environment.ts` | from `src/environments/environment.prod.ts` |
| Backend | Cloudflare Worker `…-dev` | Cloudflare Worker (prod) |
| Database | Neon branch `dev` | Neon branch `main` |

### Environment variables

| Variable | Scope | Where it lives | Notes |
|---|---|---|---|
| `DATABASE_URL` | Backend | `backend/.env` (local) · Worker secret (deployed) | Postgres / Neon pooled connection string |
| `CORS_ORIGIN` | Backend | `backend/.env` · Worker var | Allowed frontend origin(s) |
| `PORT` | Backend (local only) | `backend/.env` | Local Express port (not used on Workers) |
| API base URL | Frontend | `src/environments/environment*.ts` | Baked at build time; Admin can override at runtime |

> The frontend does **not** read `.env` at runtime — its API URL is compiled in from `environment*.ts`. See `.env.example` for the full reference.

Full hosting plan and rollout phases live in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Angular CLI reference

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
