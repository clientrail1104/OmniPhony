# Event and control contracts

Browser subscribes by fetching POST /v1/ws-ticket with Bearer token then opening:

```js
const socket = new WebSocket('wss://workspace.example.org/events', ['ticket.' + ticket]);
```

Origin must equal PUBLIC_ORIGIN. Ticket is single-use, 30-second TTL, kept out of URLs.
Token expiry closes the socket within the heartbeat interval. API messages are hints;
there is no replay in Pub/Sub. Fetch authoritative snapshots on reconnect. The shipped
WS service only forwards the principal's own user channel and implements presence.changed.
It does not broadcast queue PII to every agent. Queue-level events need scoped fan-out.

Production durable event envelope (design):

```json
{"id":"uuid","schemaVersion":1,"tenantId":"uuid","aggregateId":"uuid",
 "aggregateVersion":12,"type":"call.answered","occurredAt":"2026-10-05T12:00:00Z",
 "correlationId":"uuid","data":{"callId":"uuid","switchId":"fs01","switchUuid":"uuid"}}
```

Types: call.created/ringing/answered/held/resumed/ended, agent.presence.changed,
queue.snapshot, wallet.reserved/settled, conversation.updated, message.received/sent/failed,
transcript.partial/final, bot.escalated, recording.ready and invoice.issued.
Do not include credentials, complete transcripts or payment information in generic fan-out.

Control worker contract: accepts typed commands {id,tenantId,actorId,callId,expectedVersion,
action,parameters,deadline,reason}, authenticates service identity and obtains a fenced
lease. Load call -> switch/UUID mapping from DB, validate ownership/state, write audit,
execute bounded allowlisted operation then emit result. A 202 response means accepted,
not completed. Idempotency keys map to canonical request hashes; reusing a key with a
different payload returns 409. Never retry originate blindly after unknown outcomes.

Bot stream contract: initial authenticated control JSON {callId,tenantId,format:"pcm_s16le",
sampleRate:16000,channels:1}; binary frames paired with sequence/capture timestamp. Outbound
speech has generationId and chunk sequence. speech.start cancels previous generation;
media flush acknowledgements prevent stale queued audio after barge-in. Enforce bounded
queues (e.g. 200 ms audio backlog) and explicit overload escalation.
