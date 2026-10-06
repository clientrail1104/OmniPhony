# Omni500 — Omnichannel Contact Center Engineering Package

**Delivery status: reference implementation + production architecture. Not a turnkey or
500-agent-certified deployment.** No live carrier, ASTPP, social provider, GPU service or
production cluster was connected during authoring. The FreeSWITCH dialplan deliberately
rejects calls until the trusted routing/billing adapter is completed.

The design targets **500 concurrent agents and 500 concurrent bridged voice conversations**
with three media servers, two SIP edges and two TURN nodes. Capacity and <200 ms audio are
acceptance targets within a defined network envelope, not verified guarantees.

## The four requested deliverables

| Deliverable | Files | Actual status |
|---|---|---|
| Docker deployment | `docker-compose.yml`, `deploy/media.compose.yml`, service templates | Configured topology templates; require audited image digests, certificates, secrets, infrastructure and adapters |
| PostgreSQL schema | `db/schema.prisma`, `db/001_initial.sql`, `db/hardening.sql` | Prisma schema validated; SQL generated; live migration/RLS not executed |
| React/TypeScript softphone | `apps/web/src/Softphone.tsx`, `useSoftphone.ts` | Implemented with SIP.js 0.21.2; TypeScript/build checked; live SIP interoperability not tested |
| CSV/rating module | `billing/rating.py`, `import_rates.py`, `apps/api/src/rating.mjs` | Exact arithmetic and boundary tests pass; database CSV importer needs live integration testing |

## Additional contents

- Production architecture, capacity assumptions, latency budget and failure modes.
- 29 OpenAPI operations: **6 implemented business routes**, remaining operations explicitly
  marked design-only with `x-implemented: false`. Health endpoints are additional runtime routes.
- Authenticated Node API and WebSocket fan-out, one-use connection tickets and temporary
  TURN credentials. OIDC provider provisioning/login is external to this package.
- PostgreSQL wallet reservation/settlement functions, immutable ledger permissions,
  tenant RLS, audit/outbox schema and idempotent settlement behavior.
- IVR graph schema/example, queue/skills/callback design, bot streaming/barge-in contracts,
  supervisor control boundaries and official omnichannel connector requirements.
- Invoice PDF renderer for an authorized snapshot. It is not an automated accounting scheduler.
- Release checklist, ASTPP/CGRateS integration notes and verified-source references.

## Start with working local components

Requirements: Node.js 22.12+ or compatible Node 24, npm, Python 3.11+. Core rating has no
Python dependencies. Import/PDF helpers use `billing/requirements.txt`.

```bash
npm ci
npm test
node --test tests/rating.test.mjs
npm run build
npm run dev -w apps/web
```

A trusted HTTPS site and provisioned WSS SIP service are needed for real calls. Localhost
can be used for UI development. Register with your own temporary agent credentials and
TURN credentials; no example login is supplied. The balance intentionally says Unavailable
until a host application supplies an authorized balance. The component supports inbound,
outbound, two lines, mute, hold/resume, INFO DTMF, blind transfer and consultation-based
warm transfer. Interoperability depends on endpoint REFER/Replaces/NOTIFY support.

Rate a **31,001 ms answered call** to a Malaysian mobile example:

```bash
python3 billing/rating.py examples/rates.csv +60123456789 31001 --at 2026-10-05T00:00:00Z
```

Result: **36,000 billed milliseconds, MYR 0.128000** using the example 30/6 tariff,
MYR 0.020000 setup fee and MYR 0.180000/minute. These are fabricated test tariffs, not
carrier quotations. An unanswered call costs zero under the documented example policy.

## What remains before live service

| Capability | Implementation still required |
|---|---|
| SIP/ACD control | Fenced ESL worker, authenticated tenant mapping, carrier provisioning, centralized assignment, WSS edge affinity and switch-local prepaid cutoff |
| Billing platform | Audited ASTPP CE image + release-specific adapter OR commissioned CGRateS; choose exactly one balance authority |
| Unified inbox | Custom workspace views and scoped Chatwoot adapter; provider credentials, webhooks and app approvals |
| Supervisor | Queue-scoped monitor/whisper/barge execution and audited UI |
| IVR | Visual drag/drop editor, semantic validator, compiler and runtime orchestration |
| AI | Full-duplex media adapter, STT/VAD/LLM/TTS service integration, calibrated confidence and escalation |
| Recording/invoices | Upload/retention workers, waveform/transcript UI, scheduled invoice issue and regional tax policy |
| Production HA | Database quorum/fencing, Redis HA connectivity, replicated storage, multi-host deployment and recovery tests |

Chatwoot CE does not include every requested enterprise feature. ASTPP’s runtime is not
PostgreSQL-only. Redis Pub/Sub is not a durable billing ledger. Open-source software has
licenses; eliminating proprietary license fees does not eliminate infrastructure or
PSTN/messaging charges. See the architecture and source notes for these design decisions.

## Reading order

1. `docs/ARCHITECTURE.md` — topology, capacity, billing and feature design.
2. `docs/openapi.yaml` and `docs/EVENTS.md` — API and event contracts.
3. `docs/DEPLOYMENT.md` and `docs/ASTPP.md` — commissioning and integration boundaries.
4. `docs/VALIDATION.md` — actual executed checks and limitations.
5. `docs/ACCEPTANCE.md` — required live-service release evidence.

Original code is MIT licensed. Third-party software/models retain their own terms.
