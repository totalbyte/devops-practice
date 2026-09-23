# Relativa -- AI Agent Context Guides

> **Last verified:** 2026-09-23 (New CI pipeline: CI-PIPELINE.md added; PROJECT-STATUS.md, PROJECT-OVERVIEW.md, DOCKER-SETUP.md, ARCHITECTURE.md updated.)

Relativa is a multi-tenant CRM / sales-workspace platform built as a microservice monorepo. It includes .NET 10 backend services, a Vue 3 SPA client, a Django ML service, PostgreSQL 16, a YARP API gateway, and SignalR for real-time graph updates. Everything runs locally via Docker Compose; GitHub Actions lints, builds, tests, scans, and publishes every service image to GHCR.

---

## Maintenance Obligation (READ THIS FIRST)

**Any AI agent that modifies this project must update the corresponding guide(s) before finishing its task.**

| What you changed | Update these guides |
|---|---|
| Touched **frontend layouts, brand mark, design tokens, or user-facing copy** | [FRONTEND-UI.md](docs/ai-guides/FRONTEND-UI.md) |
| Added, removed, or changed an **endpoint** | [MICROSERVICES.md](docs/ai-guides/MICROSERVICES.md) |
| Added or removed a **service** | [MICROSERVICES.md](docs/ai-guides/MICROSERVICES.md), [DOCKER-SETUP.md](docs/ai-guides/DOCKER-SETUP.md), [PROJECT-OVERVIEW.md](docs/ai-guides/PROJECT-OVERVIEW.md) |
| Changed **Docker Compose, Dockerfiles, networking, or env vars** | [DOCKER-SETUP.md](docs/ai-guides/DOCKER-SETUP.md) |
| Changed **Rabbit choreography topology / DLQs / ops playbooks** | [RABBITMQ-CHOREOGRAPHY.md](docs/runbooks/RABBITMQ-CHOREOGRAPHY.md), plus [ARCHITECTURE.md](docs/ai-guides/ARCHITECTURE.md) |
| Changed **architecture patterns, layers, persistence model, validation, or auth flows** | [ARCHITECTURE.md](docs/ai-guides/ARCHITECTURE.md) |
| **Implemented a feature** that was listed as stub/TODO, or introduced a **new known issue** | [PROJECT-STATUS.md](docs/ai-guides/PROJECT-STATUS.md) |
| **Added or changed the audit read API** | [AUDIT-LOG-API.md](docs/ai-guides/AUDIT-LOG-API.md), [MICROSERVICES.md](docs/ai-guides/MICROSERVICES.md) |
| Changed the **general purpose, domain model, or tech stack** | [PROJECT-OVERVIEW.md](docs/ai-guides/PROJECT-OVERVIEW.md) |
| Added or changed **database entities/tables** | [AUDIT-COVERAGE-MATRIX.md](docs/ai-guides/AUDIT-COVERAGE-MATRIX.md), [AUDIT-AGENT-REQUIREMENTS.md](docs/ai-guides/AUDIT-AGENT-REQUIREMENTS.md) |
| Changed **CI workflows, lint rules (`.editorconfig`, Ruff, ESLint), `.trivyignore`, `.dockerignore`, or image tags/registry** | [CI-PIPELINE.md](docs/ai-guides/CI-PIPELINE.md) |
| Added a **service or test project** | Also add it to the matrices in `.github/workflows/ci.yaml` and to [CI-PIPELINE.md](docs/ai-guides/CI-PIPELINE.md) |
| Renamed/removed a **CI job, its `name:`, or a matrix `service`**, or changed `ci-result.needs` | [CI-PIPELINE.md](docs/ai-guides/CI-PIPELINE.md) -- and tell the user to update the **required status checks** in GitHub → Settings → Branches → `main`. Check names are matched by name only; a stale one blocks every PR merge. This setting is outside the repo, so an agent cannot fix it itself. |

**Audit policy:** For any DB model change, AI agents must read and follow [AUDIT-AGENT-REQUIREMENTS.md](docs/ai-guides/AUDIT-AGENT-REQUIREMENTS.md) before finishing the task.

**Always** update the "Last verified" date at the top of any guide you modify.

---

## Guide Index

| Guide | Path | What it covers |
|---|---|---|
| **Frontend UI** | [docs/ai-guides/FRONTEND-UI.md](docs/ai-guides/FRONTEND-UI.md) | Brand mark, color tokens, voice/terminology rules, layout primitives, form conventions for the Vue SPA |
| **Project Overview** | [docs/ai-guides/PROJECT-OVERVIEW.md](docs/ai-guides/PROJECT-OVERVIEW.md) | General purpose, business domain, tech stack, repo layout, existing docs map |
| **Microservices** | [docs/ai-guides/MICROSERVICES.md](docs/ai-guides/MICROSERVICES.md) | Per-service catalog: purpose, endpoints, status, key files |
| **Architecture** | [docs/ai-guides/ARCHITECTURE.md](docs/ai-guides/ARCHITECTURE.md) | Layered structure, persistence library, validation, auth flow, domain model, conventions |
| **Docker Setup** | [docs/ai-guides/DOCKER-SETUP.md](docs/ai-guides/DOCKER-SETUP.md) | Compose topology, dependency order, networking, Dockerfiles, environment config |
| **Project Status** | [docs/ai-guides/PROJECT-STATUS.md](docs/ai-guides/PROJECT-STATUS.md) | What is implemented, what is stubbed, known issues, roadmap |
| **Audit Coverage Matrix** | [docs/ai-guides/AUDIT-COVERAGE-MATRIX.md](docs/ai-guides/AUDIT-COVERAGE-MATRIX.md) | Current auditable-table scope and gap tracking |
| **Audit Agent Requirements** | [docs/ai-guides/AUDIT-AGENT-REQUIREMENTS.md](docs/ai-guides/AUDIT-AGENT-REQUIREMENTS.md) | Mandatory rules for AI agents when creating/changing DB entities/tables |
| **Audit log API** | [docs/ai-guides/AUDIT-LOG-API.md](docs/ai-guides/AUDIT-LOG-API.md) | `GET /audit-log` / RBAC, query params, response shape, errors |
| **CI pipeline** | [docs/ai-guides/CI-PIPELINE.md](docs/ai-guides/CI-PIPELINE.md) | GitHub Actions jobs, lint tools, image build + Trivy, GHCR tags, required checks, running checks locally |
| **RabbitMQ choreography runbook** | [docs/runbooks/RABBITMQ-CHOREOGRAPHY.md](docs/runbooks/RABBITMQ-CHOREOGRAPHY.md) | Exchange names, DLQ purge/idempotency, env keys, automated tests pointer |

---

## How to Use

Point an AI agent to this file (`AI-GUIDES-INDEX.md`) to give it full project context. For scoped tasks, point to a single guide instead -- each guide is self-contained and repeats the maintenance obligation.
