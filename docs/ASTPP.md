# ASTPP / CGRateS integration boundary

ASTPP Community is not a PostgreSQL application merely because the custom platform uses
PostgreSQL. Its selected release requires its own supported database/runtime and upstream
schema installation. The Compose `astpp` profile includes a separate MariaDB service and
an internally supplied image contract; it is NOT a prebuilt working ASTPP integration.
Do not invent `astpp/astpp:latest` or assume proprietary enterprise APIs exist in CE.

The upstream ASTPP download page distinguishes Community and Enterprise and advertises
limitations for Community. Release status is evolving. Review the exact release's source,
security patch history, license and available hooks before rollout. Do not state that all
requested enterprise functionality is available without license fees by installing CE.

## Required internal image contract

- Audited source archive/commit and license notices, reproducible build and SBOM.
- Supported OS/PHP/web-server dependencies for that exact ASTPP release.
- Web admin listens on container port 80, exposed only via private management TLS access.
- Configuration mounted at `/etc/astpp`; writable application state at `/var/lib/astpp`.
  These are contracts for YOUR image, not claims about upstream default paths.
- `/etc/astpp` contains the correct release-specific DB and FreeSWITCH integration settings.
- Migrations are a separate idempotent release job against `astpp-db`; never two workers
  racing upstream installers. Populate `secrets/astpp.env` only if your image consumes it.
- ASTPP admin credentials and DB passwords differ from application/OIDC credentials.
- Narrow private access to the approved FreeSWITCH control path, not public ESL.

This repository supplies neither that image nor its release-specific adapter. Therefore
ASTPP cannot be claimed operational from this package alone.

## Choose one financial authority per tenant/account

A. **ASTPP mode:** ASTPP controls authorization/rating/debits; custom wallets are projections
only. Import cost/sell rates through the release's supported path. Consume authoritative
CDRs and balance changes with unique upstream IDs. Reconcile every projection. Implement
and test concurrent-call credit reservation and failure cutoff in the selected ASTPP mode.

B. **CGRateS mode:** use its documented FreeSWITCH SessionManager integration for prepaid,
postpaid and CDR processing. Pin the configuration schema to its selected release. Map
tenant/account/destination/request type to trusted channel variables. A single fenced
session manager owns each media node. Its balances are authoritative; custom tables are
projections. Validate reservation refunds, grace/debit intervals and session manager loss.
No CGRateS container or integration is silently implied by the provided ASTPP profile.

C. **Custom reference mode:** the supplied exact-decimal calculator and PostgreSQL wallet
functions own accounting, once integrated with an audited call-control worker. ASTPP is
not allowed to debit these calls. This is the only accounting code implemented here.

An offline rating match is insufficient evidence for a prepaid system. Run golden CDR
parity tests across increments, setup fees, currencies, answer/hangup races, transfers,
parallel calls, duplicate events and process crashes. Explicitly define which call legs
are charged: carrier billable legs for cost, customer commercial policy for sell. Never
charge both the parent and consultation leg by accident.
