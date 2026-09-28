# SME Portal Hub

SME Portal Hub is a web-based system that enables small and medium-sized enterprises to build their own internal portal sites. It is being developed to streamline internal operations and bring company information together in one place through capabilities such as employee management, internal calendar creation and publishing, and IT asset management.

> [!NOTE]
> SME Portal Hub is currently under active development. It can be installed and evaluated, but some functionality remains incomplete and features may change.

| Your goal | Read this section |
| --- | --- |
| Install, try, or use SME Portal Hub | [Quick Start for Users](#quick-start-for-users) |
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

Open `.env` and replace the example values before starting the system. At minimum, review all PostgreSQL and `INITIAL_ADMIN_*` settings.

The initial administrator settings are:

| Variable | Description |
| --- | --- |
| `INITIAL_ADMIN_USERNAME` | Username used for the first sign-in. |
| `INITIAL_ADMIN_PASSWORD` | Temporary initial password. Use at least 12 characters, including an uppercase letter, a lowercase letter, and a number. |
| `INITIAL_ADMIN_EMAIL` | Initial administrator email address. |
| `INITIAL_ADMIN_EMPLOYEE_CODE` | Unique employee code containing 10 to 64 letters or digits. |
| `INITIAL_ADMIN_FIRST_NAME` | Administrator's first name. |
| `INITIAL_ADMIN_LAST_NAME` | Administrator's last name. |
| `INITIAL_ADMIN_BIRTH_DATE` | Birth date in `YYYY-MM-DD` format. |
| `INITIAL_ADMIN_GENDER` | One of `female`, `male`, or `unspecified`. |
| `INITIAL_ADMIN_HIRED_AT` | Hire date in `YYYY-MM-DD` format. |
| `INITIAL_ADMIN_EMPLOYMENT_TYPE` | Name of an employment type created by the initial migration, such as the value in `.env.example`. |
| `INITIAL_ADMIN_BRANCH` | Name of a branch created by the initial migration, such as the value in `.env.example`. |

Do not commit `.env` or share its passwords. The supplied `.env.example` values are examples and should not be used as production credentials.

### 4. Build and start the system

From the repository root, run:

```bash
docker compose up -d --build
```

On the first start, Docker builds the images, starts PostgreSQL, runs all Prisma migrations, creates the initial system administrator, and then starts the API, frontend, and gateway. The initial startup can take a few minutes.

### 5. Verify the installation

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

### 6. Open SME Portal Hub and sign in

After the containers are ready, open the following URL in a web browser:

```text
http://localhost:3000/
```

Sign in with the values configured in `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`.

The initial administrator must set a new strong password after the first sign-in before using the normal system features. Once the new password has been set successfully, remove all `INITIAL_ADMIN_*` entries from `.env`. Keep the PostgreSQL and CORS settings in the file.

SME Portal Hub is now ready to use.

### Starting and stopping the system

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

Rebuild after pulling source changes:

```bash
docker compose up -d --build
```

Database data is stored in the named Docker volume `sph-db-data` and is retained by `docker compose down`. Do not add the `--volumes` option unless permanent data removal is intentional and a suitable backup exists.

### Quick Start troubleshooting

#### The web page does not open

Check that all long-running services are running and healthy:

```bash
docker compose ps -a
docker compose logs gateway frontend api
```

Also confirm that port `3000` is not already used by another application.

#### The migration container failed

Review its logs:

```bash
docker compose logs migration
```

Common causes include missing or invalid `INITIAL_ADMIN_*` values, an initial password that does not meet the strength requirements, or employment type and branch names that do not match the initial master data.

After correcting `.env`, rerun:

```bash
docker compose up -d --build
```

#### A port is already in use

The default Compose configuration binds the gateway to host port `3000` and PostgreSQL to host port `5432`. Stop the conflicting application or adjust the relevant port mapping in `docker-compose.yml`.

#### Bind mounts do not work

Some Docker environments cannot reliably bind-mount projects stored on removable drives. Move the repository to an internal drive, such as `C:\projects\sph`, and start the system again.

## Developer Guide

This section is for maintainers and contributors who need to understand, verify, or modify the application. Installation and normal use are covered entirely by the Quick Start above.

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
