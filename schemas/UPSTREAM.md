# Vendored contract provenance

`receipt.schema.json` mirrors the public wire shape defined by:

- repository: `ashark-ai-05/enterprise-ai-observability`
- commit: `7c5041e`
- `src/contracts/events.ts`
- `src/contracts/workflow.ts`

Semantic Zod refinements and the stricter demo metadata-only key policy are
mirrored by `scripts/validation.mjs`. Cross-repository conformance must be rerun
whenever the upstream contract or EIL emitter changes.
