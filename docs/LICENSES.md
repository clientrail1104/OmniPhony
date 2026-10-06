# License and operating-cost policy

The original code in this package is MIT licensed (LICENSE). Upstream software retains
its own licenses. Resolve exact versions, transitive dependencies and model artifacts in
an SBOM before redistribution or hosted deployment.

- Chatwoot Community: MIT; enterprise features are excluded from the no-proprietary-fee design.
- Redis 8+: choose AGPLv3 for an open-source deployment and comply with its obligations.
  Do not label Redis 7.4 automatically BSD. Verify current upstream artifact terms.
- ASTPP Community / CGRateS / FreeSWITCH / Kamailio / Coturn: retain each selected source
  release's license and notices; no blanket relicensing of the assembled distribution.
- Piper's current maintained code and each voice model can have different licenses.
  Inspect voice MODEL_CARD files. Coqui model licenses are also model-specific.
- Whisper/Faster-Whisper libraries, LLM runtime and actual weights are separate artifacts.
  “Open weights” alone does not mean OSI-approved or commercially unrestricted.
- Hold music, prompts, recordings and generated voice rights require separate provenance.

This is a component inventory policy, not a legal opinion or certification. Telecom
services, provider messaging and infrastructure charges are outside software license fees.
