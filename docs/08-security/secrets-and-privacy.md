# Secrets and Privacy

Repositories may accidentally contain secrets.

Rules:
- do not intentionally ingest `.env` values by default;
- scanner may identify presence/names without reading values;
- no raw repo content in telemetry by default;
- redact common credential patterns from diagnostics;
- use synthetic fixtures;
- AI adapters minimize context sent externally;
- direct-provider privacy implications must be documented before release.
