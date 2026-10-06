# Release gates — execute on provisioned infrastructure

These are planned tests, not completed test results.

| Area | Required evidence / pass condition |
|---|---|
| Capacity | 500 registered agents + 500 bridged calls for 8 hours; mixed Opus/G.711; recording enabled; planned AI concurrency |
| Burst | 20 CPS and 500-agent reconnect; measure rejection rates, CPU, file descriptors, DB waits and WS backlog |
| N+1 | Drain one of three media nodes; two handle ≥500 calls; kill a node separately and record expected dropped active calls |
| Network | UDP direct, TURN/UDP, TURN/TLS, symmetric NAT, blocked UDP, IPv6 and VPN |
| Latency | P50/P95/P99 mouth-to-ear by network scenario; P95 <200 ms only within agreed supported envelope |
| Voice quality | Packet loss/jitter, one-way audio, Opus transcoding, headset/device changes, browser autoplay denial |
| SIP | Auth challenge, realm isolation, REGISTER expiry, CANCEL before answer, 408/487, forked INVITE, BYE/re-INVITE routing |
| Phone UI | Inbound/outbound, mute, hold failure, two-line switching, busy limit, INFO DTMF, blind transfer and REFER/NOTIFY attended transfer |
| Toll fraud | Reject arbitrary From/tenant headers, unauthenticated INVITEs, disallowed destinations, forged REFER and trunk abuse |
| Wallet concurrency | Hundreds of concurrent reservations cannot spend the same credit; retries do not double-debit |
| Cutoff | Tiny balance, setup fee > balance, block renewal failure, lost ESL, DB outage and worker death; bounded overrun verified |
| CDR recovery | Duplicate/out-of-order events, missing hangup recovered from spool, conflicting amount quarantined, exact ledger parity |
| RLS | Two real tenants via runtime role; cross-tenant IDs cannot read/link/update; pool reuse cannot leak tenant context |
| Rate import | Wrong header, duplicate prefix, overlap, unsupported currency, malformed decimals and ambiguous version rejected |
| Channels | Valid/forged signatures, webhook retries, duplicate messages, expired tokens, attachment SSRF and template-window enforcement |
| Supervision | Approved queue scope; whisper inaudible to customer; barge recorded/audited; termination cannot target other tenants |
| Bot | Barge-in cancels old audio, late chunks ignored, low-confidence escalation preserves live call and transcript |
| IVR/ACD | Holiday/timezone transitions, stale agent leases, global single assignment, EWT estimate, preserved callback ordering |
| Invoice | Boundary dates, late CDRs, zero charges, currency minor units, configured tax snapshots, rerun idempotency and PDF totals |
| Durability | PostgreSQL failover during settle, Redis loss, replay, object-store outage and local spool backpressure |
| Restore | Restore DB, keys, objects and configs in isolated environment; demonstrate RPO/RTO |

Use SIPp for SIP load with RTP/codec-aware media generation plus real browser automation
for WebRTC. SIPp alone is not proof of ICE/DTLS/browser behavior. Use controlled test trunks
and non-chargeable destinations. No load tests against public carrier numbers without
operator coordination. Record software digests, hardware, codec ratio, NAT modes, call
mix and percentile metrics so results are reproducible.

Suggested metrics: offered/answered/abandoned per queue; answer wait histogram; agent state
age; active media legs; ASR/ACD per carrier; SIP failure codes; RTP loss/jitter; TURN allocation
errors; WS reconnects; rating duration; reservation conflicts; unauthorized cost exposure;
unsettled CDR age; outbox lag; transcript lag; storage spool usage; DB replication lag.
Alert on nonzero reconciliation differences, repeated auth failures, aged reservations,
recording upload backlog and disabled backups. SLA wallboards are distinct from platform SLOs.
