# Managed File Ownership & Lineage

## Ownership classes

### generated
PlanMo owns the whole file.

### merged
PlanMo owns explicit structured sections/keys.

### seeded
PlanMo created the initial file, then the user owns it.

### user
PlanMo never overwrites it.

## Lineage

Managed artifacts should record or be traceable to:
- compiler version;
- pack versions;
- profile/bundle version;
- schema version;
- input model hash;
- prior generated checksum.

## Upgrade flow

`planmo update --preview`

shows:
- planned generated changes;
- collisions;
- user modifications;
- migration requirements;
- files needing manual reconciliation.

No silent overwrite.
