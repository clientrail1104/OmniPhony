# Validation evidence

Authoring date: 2026-10-05. This report records local checks only.

| Check | Result |
|---|---|
| Python rating tests | PASS: 18 tests, including one 200-case Python/Node parity test |
| Node rating tests | PASS: 4 tests |
| Total test functions | 22 passed |
| TypeScript strict typecheck | PASS with SIP.js 0.21.2 and React 19 types |
| Browser production build | PASS: esbuild generated index.html, app.js and Tailwind app.css |
| Prisma schema | PASS: prisma validate, Prisma 6.16.3 |
| SQL migration generation | PASS: initial migration generated from final schema, 469 lines |
| OpenAPI 3.1 | PASS: validated with openapi-spec-validator, 29 operations |
| IVR JSON Schema | PASS: schema and example validated with jsonschema |
| Compose YAML | PASS: YAML parsed; Docker Compose runtime validation NOT run |
| FreeSWITCH XML templates | PASS: XML parser only; module/runtime semantics NOT validated |
| Node API/wallet syntax | PASS: node --check |
| Python helper syntax | PASS: py_compile |

Rating tests cover 1/1, 60/60 and 30/6 boundaries, millisecond inputs, zero-duration answer,
unanswered calls, longest prefix, effective windows, invalid input, currency isolation,
CSV quoting, overlapping windows, LCR, markup vs margin, affordable duration, tax rounding,
monotonic cost and 200 cross-language cases. Example mobile call: 31,001 ms -> 36,000 ms
billed -> MYR 0.128000 under fabricated sample tariff.

The initial Vite production build repeatedly stalled during transformation in this
runtime. The shipped build command uses explicit esbuild + PostCSS/Tailwind instead and
completed successfully. Vite remains available as the development server and has not been
browser-smoke-tested here. Build-time checks do not establish SIP interoperability.

## Not run / not established

- Docker is unavailable in the authoring environment. No containers/images were pulled,
  provisioned or started. Blank image digests and secret examples are deployment inputs.
- No live PostgreSQL server: generated migration, RLS, wallet locks, settlement concurrency
  and CSV database import were not integration-tested. Do not infer transactional safety
  from unit arithmetic tests alone.
- No live OIDC, Redis, SIP/WSS, FreeSWITCH, Kamailio, Coturn, ASTPP or CGRateS integration.
- No real browser/headset microphone, ICE, DTLS, audio, REFER/Replaces or DTMF tests.
- No PDF invoice output rendered or visually checked; renderer is supplied source only.
- No providers/webhooks, SMTP/IMAP, bot streams, supervisor execution or recording upload.
- No 500-agent/500-call load benchmark, latency measurement, failover or restore exercise.
- No security audit, dependency vulnerability certification or compliance certification.

See README's implementation matrix and docs/ACCEPTANCE.md before planning a live release.
