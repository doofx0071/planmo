# Exit Code Contract

Shipped — what the CLI returns today, and what `planmo --help` prints:

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | success                                                                 |
| `1`  | general failure — a validation or doctor error, an unknown command, or invalid usage |
| `2`  | collision refused — an existing file was kept; re-run with `--force` to overwrite |
| `3`  | no project found — no usable `.planmo/` workspace at or above the target directory |

`3` is also the catch-all when a command cannot read the workspace it was given
(a missing or corrupt `.planmo/`), so read it as "this directory is not a usable
workspace", not strictly "no `.planmo/` exists".

`planmo --help` closes with this exact line:

```text
Exit codes: 0 ok · 1 error · 2 collision refused · 3 no project found
```

## Reserved (not yet used)

An earlier proposal reserved a wider band for finer-grained failures. Nothing
implements these; they are listed only so the numbers are not reused by accident:

| Code | Proposed meaning                     |
| ---- | ------------------------------------ |
| `4`  | validation/doctor error findings     |
| `5`  | filesystem safety refusal            |
| `6`  | pack resolution failure              |
| `7`  | blocked workflow/human gate          |
| `8`  | unsupported compatibility            |
| `9`  | external integration failure         |
