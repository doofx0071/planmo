# Test Matrix

| Area | Unit | Integration | Golden | E2E | Security |
|---|---:|---:|---:|---:|---:|
| Schema/model | ✓ | ✓ |  |  | malformed input |
| CLI | ✓ | ✓ |  | ✓ | argument/path abuse |
| Filesystem writer | ✓ | ✓ |  | ✓ | ✓ critical |
| Packs | ✓ | ✓ | ✓ |  | malicious/conflicts |
| Generator | ✓ | ✓ | ✓ | ✓ | overwrite/path |
| Agent adapters | ✓ | ✓ | ✓ | optional | injection |
| Design engine | ✓ | ✓ | ✓ |  | registry trust |
| Workflow | ✓ | ✓ | ✓ | ✓ | state corruption |
| Trace/doctor | ✓ | ✓ | ✓ | ✓ | false negatives |
| Scanner/adopt | ✓ | ✓ | ✓ | ✓ | ✓ critical |
