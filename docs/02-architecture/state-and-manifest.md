# State, Lockfile, and Manifest

## `.planmo/project.yml`
User/project configuration and explicit decisions.

## `.planmo/state.yml`
Operational workflow state: current phase, tasks, blockers, last handoff, next prompt.

## `.planmo/lock.yml`
Resolved PlanMo/pack/adapter versions and remote source integrity data.

## `.planmo/manifest.json`
Generated artifact ownership/provenance:
- path;
- artifact kind;
- generator;
- source pack(s);
- checksum;
- ownership mode;
- generation version.

Ownership modes:
- `managed`
- `merge`
- `user`
