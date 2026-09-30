# SME Portal Hub

SME Portal Hub is a web-based system that enables small and medium-sized enterprises to build their own internal portal sites. It is being developed to streamline internal operations and bring company information together in one place through capabilities such as employee management, internal calendar creation and publishing, and IT asset management.

> [!NOTE]
> SME Portal Hub is currently under active development. It can be installed and evaluated, but some functionality remains incomplete and features may change.

| Your goal | Read this section |
| --- | --- |
| Install, try, or use SME Portal Hub | [Quick Start for Users](#quick-start-for-users) |
| Diagnose an installation problem | [Quick Start troubleshooting](#quick-start-troubleshooting) |
| Start or stop an existing installation | [Starting and stopping the system](#starting-and-stopping-the-system) |
| Understand, verify, or modify the codebase | [Developer Guide](#developer-guide) |

The system includes:

- Employee management and role-based access control
- Internal calendar creation and publishing
- Branch, room, and storage-location management
- IT asset records, assignments, returns, and change history
- Master data for employees and IT assets
- Dashboards and user settings

## Quick Start for Users

This section contains everything needed to install and start using SME Portal Hub. If you only want to try or use the system, you do not need to read the Developer Guide.

### 1. Check the prerequisites

Before continuing, make sure the following are available:

- Git
- Docker with the `docker compose` command
- Ports `3000` and `5432` available on the host

Docker installation instructions are outside the scope of this document.

### 2. Download the system

```bash
git clone https://github.com/HidekiMorisaki/sph.git
cd sph
```

If the repository was downloaded by another method, open a terminal in the repository root instead.

### 3. Create the environment file

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

Open `.env` and replace the example values before starting the system. At minimum, review the PostgreSQL settings and configure the initial administrator credentials below.

The initial administrator settings are:

| Variable | Description |
| --- | --- |
| `INITIAL_ADMIN_USERNAME` | Username used for the first sign-in. |
| `INITIAL_ADMIN_PASSWORD` | Temporary initial password. Use at least 12 characters, including an uppercase letter, a lowercase letter, and a number. |

After signing in, the other initial administrator details can be changed in **Settings** for personal information and **Employees** for employment and organization information.

Do not commit `.env` or share its passwords. The supplied `.env.example` values are examples and should not be used as production credentials.

### 4. Build and start the system

From the repository root, run:

```bash
docker compose up -d --build
```

On the first start, Docker builds the images, starts PostgreSQL, runs all Prisma migrations, creates the initial system administrator, and then starts the API, frontend, and gateway. The initial startup can take a few minutes.

### 5. Open SME Portal Hub and sign in

After the containers are ready, open the following URL in a web browser:

```text
http://localhost:3000/
```

Sign in with the values configured in `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`.

The initial administrator must set a new strong password after the first sign-in before using the normal system features. Once the new password has been set successfully, remove all `INITIAL_ADMIN_*` entries from `.env`. Keep the PostgreSQL and CORS settings in the file.

SME Portal Hub is now ready to use.

## Quick Start troubleshooting

### Verify the installation

Show all containers, including the one-time migration container:

```bash
docker compose ps -a
```

The expected state is:

- `db`, `api`, `frontend`, and `gateway` are running.
- `migration` has exited with status code `0`.

If startup is still in progress or a service failed, inspect the logs:

```bash
docker compose logs migration
docker compose logs api frontend gateway db
```

Verify the API through the gateway:

```bash
curl http://localhost:3000/v1/health
```

Windows PowerShell users can run:

```powershell
Invoke-RestMethod http://localhost:3000/v1/health
```

A successful response reports that the `equipment-api` service is healthy.

### The web page does not open

Check that all long-running services are running and healthy:

```bash
docker compose ps -a
docker compose logs gateway frontend api
```

Also confirm that port `3000` is not already used by another application.

### The migration container failed

Review its logs:

```bash
docker compose logs migration
```

Common causes include missing or invalid `INITIAL_ADMIN_*` values, an initial password that does not meet the strength requirements, or employment type and branch names that do not match the initial master data.

After correcting `.env`, rerun:

```bash
docker compose up -d --build
```

### A port is already in use

The default Compose configuration binds the gateway to host port `3000` and PostgreSQL to host port `5432`. Stop the conflicting application or adjust the relevant port mapping in `docker-compose.yml`.

### Bind mounts do not work

Some Docker environments cannot reliably bind-mount projects stored on removable drives. Move the repository to an internal drive, such as `C:\projects\sph`, and start the system again.

## Starting and stopping the system

View service status:

```bash
docker compose ps -a
```

Follow logs:

```bash
docker compose logs -f
```

Restart the application:

```bash
docker compose restart
```

Stop and remove the containers while preserving database data:

```bash
docker compose down
```

Start the existing installation again:

```bash
docker compose up -d
```

Database data is stored in the named Docker volume `sph-db-data` and is retained by `docker compose down`. Do not add the `--volumes` option unless permanent data removal is intentional and a suitable backup exists.

## Upgrading to the latest version

To upgrade from any earlier version, run the following commands from the repository root in Windows PowerShell:

```powershell
docker compose stop gateway frontend api
git pull --ff-only
.\scripts\update.ps1
```

## Developer Guide

This section is for maintainers and contributors who need to understand, verify, or modify the application. Installation and normal use are covered by the user sections above.

### Architecture

The application runs as five Docker Compose services:

| Service | Responsibility |
| --- | --- |
| `gateway` | Nginx entry point. Routes `/v1/*` to the API and all other requests to the frontend. |
| `frontend` | SvelteKit SSR/SPA user interface. It communicates with the backend only through the REST API. |
| `api` | Versioned REST API, authentication, authorization, business logic, and Prisma access. |
| `migration` | Applies Prisma migrations and creates the initial system administrator. It exits after successful setup. |
| `db` | PostgreSQL database. |

The browser uses a single origin through the gateway:

```text
Browser -> http://localhost:3000 -> gateway -> frontend
                                      `-----> api -> PostgreSQL
```

Prisma, database access, authentication, authorization, and business logic belong exclusively to the API. The frontend communicates with the backend only through the versioned REST API. Authentication uses server-side sessions stored in PostgreSQL, and application records use soft deletion for audit-oriented data management.

### Technology stack

- SvelteKit, Svelte, and TypeScript
- PostgreSQL
- Prisma ORM
- Nginx
- Docker Compose

### API documentation

The REST API is available under the versioned `/v1/` path through the gateway.

- Health check: `http://localhost:3000/v1/health`
- OpenAPI 3.1 specification: [`api/openapi/openapi.yaml`](api/openapi/openapi.yaml)

### Development checks

With the Compose services running, execute the project checks inside their containers:

```bash
docker compose exec frontend npm run check
docker compose exec frontend npm run build
docker compose exec api npm run check
docker compose exec api npm run build
docker compose exec api npm run db:verify
```

The Compose configuration uses development image targets and bind mounts. Before exposing the system outside a trusted development network, create a production deployment configuration with appropriate TLS, secret management, network restrictions, backups, and non-development builds.

## Acknowledgements

The UI design of SME Portal Hub was inspired by [Gentelella v4 — Free Admin Dashboard Template](https://github.com/colorlibhq/gentelella). We are grateful to the Gentelella contributors—and to all developers who generously make high-quality design templates available to the community at no cost.
