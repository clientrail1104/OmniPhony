# Upstream references consulted

Documentation retrieved during this task; validate the release you actually deploy.

- SIP.js transfer / full API: https://sipjs.com/guides/transfer/
- SIP.js installed package inspected and typechecked: npm sip.js 0.21.2.
- Chatwoot Docker and CE tag/migration requirements: https://developers.chatwoot.com/self-hosted/deployment/docker
- Chatwoot upstream Compose: https://github.com/chatwoot/chatwoot/blob/develop/docker-compose.production.yaml
- Chatwoot CE feature boundaries: https://www.chatwoot.com/pricing/self-hosted-plans
- Chatwoot licensing: https://www.chatwoot.com/hc/user-guide/articles/1677776492-enterprise-edition
- ASTPP editions and download limitations: https://astppbilling.org/download
- ASTPP Community roadmap: https://astppbilling.org/news/first-look-at-community-edition-v7
- CGRateS FreeSWITCH integration: https://cgrates.readthedocs.io/en/v0.10/freeswitch.html
- Redis Pub/Sub delivery semantics: https://redis.io/docs/latest/develop/pubsub/
- Redis current license options: https://redis.io/de/legal/licenses/
- Piper voice model license review: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md
- Piper release/licensing changes: https://github.com/OHF-Voice/piper1-gpl/releases

Architecture sizing, latency budgets and release gates are engineering proposals, not
upstream performance claims. Do not read a documented capability as evidence that this
specific assembled deployment has passed integration or capacity testing.
