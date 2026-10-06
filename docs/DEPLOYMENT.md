# Deployment runbook

## What can run now

`npm ci`, `npm test`, `node --test tests/rating.test.mjs` and `npm run build` exercise
core code. `npm run dev -w apps/web` opens the softphone against a separately provisioned
SIP/WSS service. This repository DOES NOT contain an operating carrier-connected PBX,
ASTPP container build, call-control worker, unified inbox adapter or production identity
provider. The media dialplan intentionally rejects calls until the adapter is integrated.
Do not mistake `docker compose up` for production commissioning.

Docker Compose is a single-host supervisor. It does not create cross-host networking,
quorum, service discovery or automatic multi-host failover. The main file is a control-plane
reference; the media file is repeated by an operator on dedicated Linux VMs. For 500 agents
use redundant control VMs or translate the stateless tier to Kubernetes/Nomad. Keep host
network media on dedicated nodes. Database/Redis HA must be provisioned independently
and the app URLs changed to their HA endpoints. The included single database/Redis volumes
are appropriate only for integration or an explicitly accepted single-host failure domain.

## 1. Resolve immutable dependencies

- Review upstream release support/security status and licenses. `.env.example` intentionally
  leaves image digests blank. Fill each image with `registry/repository@sha256:<real-digest>`.
  Compose interpolates even inactive profiles, so resolve all variables or remove unused
  profiles from your deployment copy. Do not insert fabricated digests to satisfy preflight.
- PostgreSQL image: pgvector build compatible with PostgreSQL 16 and selected Chatwoot CE.
- Redis: reviewed supported Redis 8 release using its AGPLv3 option if an OSI-approved
  license is required. Do not silently use Redis 7.4's source-available terms.
- Chatwoot: explicit release `vX.Y.Z-ce` image, then resolve its digest. Do not use an
  enterprise image and assume all features are free.
- FreeSWITCH: build/audit a supported source release with mod_sofia, mod_opus, mod_dptools,
  mod_event_socket, mod_conference, mod_callcenter, mod_lua, recording and CDR modules.
  The selected image must use the `/usr/local/freeswitch` layout or paths must be adjusted.
  Preserve its matching upstream default configuration as a build artifact before overlaying
  our XML. Never download and execute an unreviewed remote installer as root.
- Kamailio: include db_postgres, TLS/websocket, auth_db, usrloc, dispatcher and domain modules.
- The app Dockerfiles pin JS dependencies via package-lock but base-image tags still need
  replacement with approved digests before a release. Generate an SBOM and scan all images.

## 2. Credentials and data roles

Create root-owned `secrets/` with mode 0700 and files mode 0600 on the deployment host.
Use the runtime secret manager in production instead of checking `.env` files into git.
Required files: `pg_admin_password`, `redis.acl`, `api.env`, `chatwoot.env`, `astpp.env`,
`astpp_db_password` and `mariadb_root_password` for the profiles you enable.

Example Redis ACL shape (replace every token; the service users must not be `default`):

```
user default off
user api on >RANDOM_API_SECRET ~omni:* &omni:* +ping +get +getdel +set +del +publish +psubscribe +punsubscribe +subscribe +unsubscribe +quit +client|setinfo +client|setname
user chatwoot on >DIFFERENT_SECRET ~* &* +@all
```

Chatwoot and API should use separate Redis instances in hardened deployments. Different
logical DB numbers are not a security boundary for Pub/Sub. The broad Chatwoot ACL belongs
on its isolated instance. Secrets in URLs must be percent-encoded.

Initialize separate DB owners and databases for omni, Chatwoot and Kamailio. Do not share
schemas. ASTPP uses its own MariaDB and its own upstream migrations. Create `cc_app LOGIN
NOSUPERUSER NOBYPASSRLS` separately and `cc_migrate` as schema owner. Grant schema USAGE.
The JWT subject is mapped to a provisioned User row, not auto-created from arbitrary claims.

From a reviewed migration workspace:

```bash
npm ci
# DATABASE_URL points to migration role, not cc_app.
npx prisma migrate diff --from-empty --to-schema-datamodel db/schema.prisma --script > db/001_initial.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/hardening.sql
```

An initial SQL migration is included when generated successfully in this package. Review
it before applying. `hardening.sql` is a one-time migration, not a repeatedly runnable
bootstrap script. Future changes use versioned migrations. Provision the first tenant,
user and wallet through a controlled owner migration with audit evidence; never grant a
web user superuser access. RLS tests must run as cc_app, not the postgres superuser.

Configure OIDC issuer/JWKS/audience, account mappings and TURN URLs in `secrets/api.env`.
The included UI has manual SIP registration for integration tests. A production portal
still needs OIDC login and authenticated short-lived SIP/ICE provisioning. The UI does not
silently persist passwords. The shown balance remains Unavailable until its host supplies
an authorized balance summary; agent access to arbitrary wallets is intentionally denied.

## 3. TLS and control plane

Issue trusted certificates for workspace, chat, voice and TURN hostnames. Mount private
keys read-only, restrict permissions and automate reload after renewal. Replace example
hosts in the nginx file. Configure the edge load balancer for HTTPS/WS keepalive and
bounded request bodies. Do not add HTTP-to-HTTPS redirect without arranging port 80 and
certificate validation deliberately. DNS and public addresses are prerequisites.

```bash
cp .env.example .env
# Fill digests and create secret files before running these commands.
docker compose config --quiet
docker compose up -d postgres redis
# Apply app schema and provisioning above.
docker compose up -d --build api web proxy
# Optional channels, after separate chatwoot DB/user is ready:
docker compose --profile channels run --rm chatwoot bundle exec rails db:chatwoot_prepare
docker compose --profile channels up -d chatwoot chatwoot-worker
```

Add a TLS vhost for Chatwoot when enabling it. `chatwoot.env.example` uses local storage
for a single instance; production replicas require shared S3-compatible storage configured
with the variables for the chosen release. A shared local Docker volume does not span hosts.
Scale API via `--scale api=3` on one host for an integration test only. Upstream nginx needs
reload/re-resolution during replica changes. This does not create cross-host HA.

## 4. Media placement

On each dedicated host copy this repository's deploy files and an approved image set.
Build `rendered/freeswitch` from the exact image's default configuration, remove sample
users/default passwords and demo dialplans, then overlay:

| Template | Target in rendered/freeswitch |
|---|---|
| vars.xml.template | vars.xml |
| event_socket.conf.xml.template | autoload_configs/event_socket.conf.xml |
| acl.conf.xml | autoload_configs/acl.conf.xml |
| contact-center.xml.template | sip_profiles/contact-center.xml |
| contact-center-dialplan.xml | dialplan/contact-center.xml |

Disable conflicting default SIP profiles and restrict RTP range in switch.conf.xml
(e.g. 20000–39999). Replace `__PRIVATE_IP__`, `__PUBLIC_IP__` and `__ESL_SECRET__` per node.
Use a public reachable external RTP candidate; public-IP/private-IP NAT mapping must agree
with the firewall. Do not use bridge-container DNS names in advertised SDP.

Create `rendered/kamailio/kamailio.cfg` from the template plus dispatcher.list. Initialize
Kamailio's upstream DB schema for the selected release, provision tenant domains and
HA1 subscriber records and secure access to that DB. Kamailio HA1 is sensitive credential
material. Registration replication alone cannot transfer an open TCP/WebSocket connection
between proxies: use Path/edge affinity and shared registration topology deliberately.
The reference registrar template does NOT finish cross-edge WSS flow routing. Implement
Path/Outbound handling and test failover before enabling both edges for live traffic.

Configure voice TLS reverse proxy on each SIP node: `/ws` -> `127.0.0.1:8080`, preserving
Upgrade, Connection and Origin. Use the exact public URI and record-route advertising
required by your topology. Do not route WSS through an HTTP proxy that strips SIP headers.
Template Kamailio record-route/WSS topology and re-INVITE routing require integration tests.

Render Coturn config per relay. Restrict allocations by username/quota and block internal
metadata/private ranges. TURN/TLS 5349 can be blocked on some corporate networks; dedicate
an IP with TURN/TLS on 443 if that customer network requires it. Do not place TURN behind
an ordinary HTTP reverse proxy. Share the TURN HMAC secret with the credential issuer only.

Run ONE profile per assigned host (from repository root):

```bash
docker compose --project-directory . -f deploy/media.compose.yml --profile sip up -d
# On each media host instead:
docker compose --project-directory . -f deploy/media.compose.yml --profile media up -d
# On each TURN host instead:
docker compose --project-directory . -f deploy/media.compose.yml --profile turn up -d
```

Profiles do not provision hosts. Three invocations on the same machine do not create
three failure domains. Configure capacity-based admission in the control worker before
using dispatcher round-robin as a production selector.

## 5. Network matrix

| Flow | Ports | Allowed sources |
|---|---|---|
| Browser HTTPS/WSS | TCP 443 | Agents / permitted public clients |
| Browser TURN | UDP/TCP 3478, TCP 5349 or dedicated 443 | Authenticated TURN users |
| TURN relay | UDP 49152–65535 | Valid allocations, monitored/limited |
| FreeSWITCH RTP/SRTP | UDP 20000–39999 | Browser/TURN/carrier media paths |
| SIP edge -> FreeSWITCH | UDP/TCP 5060 or selected TLS port | Exact edge private IPs |
| Carrier SIP | Negotiated SIP/TLS ports | Provider IP allowlist + authentication |
| ESL | TCP 8021 | Fenced control workers over private VPN only |
| PostgreSQL | TCP 5432 | App/control/replication, never public |
| Redis | TCP 6379 (TLS in production) | Scoped internal clients |
| MariaDB | TCP 3306 | ASTPP only |

Firewall deny-by-default also applies to IPv6. Do not expose ESL, databases, metrics,
container sockets or administrative consoles publicly. Use WireGuard/IPsec/mTLS between
hosts if the private network is not a trusted isolated segment. ESL has no assumed TLS;
protect it with network isolation/VPN and strong credentials.

## 6. Production HA and restore

PostgreSQL: deploy an established HA controller such as Patroni with three independent
quorum voters, synchronous replication policy and fencing. Use PgBouncer for app sessions
with transaction-compatible SET LOCAL tenant context. Test failover with billing writes.
Synchronous replication improves durability at availability/latency cost; select policy
explicitly. External HA endpoints replace single-container URLs in the sample Compose.

Redis: Sentinel or supported alternative, persistent volumes and noeviction. The included
Node client is configured with one URL, so put a tested HA proxy in front or implement the
selected client's Sentinel topology configuration. An arbitrary URL is not automatic HA.

Daily physical backups plus continuous WAL archive, encrypted object storage and regular
point-in-time restore exercises. Initial targets: DB RPO ≤5 minutes for disaster recovery,
RTO ≤60 minutes; synchronous local failover aims for lower loss but must be tested. Back up
Chatwoot, ASTPP, configurations, media and key material separately. A backup without usable
encryption keys is not a restoration plan. Never test restore over the production cluster.

Before releasing, complete docs/ACCEPTANCE.md. No deploy or 500-agent benchmark was run
in the authoring environment. See docs/VALIDATION.md for actual validation evidence.
