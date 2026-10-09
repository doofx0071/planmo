---
'planmo': minor
---

`planmo diff` — see what `generate` would change, before letting it change it.

```console
$ planmo diff
The planning tree already matches the project model.
  24 generated document(s) already current.
  6 document(s) you own, left alone.

$ planmo diff              # after deleting a generated document
Would create (1):
  planning/testing/TEST-STRATEGY.md

1 document(s) would change, 0 refused.
Run `planmo generate` to apply.
```

`generate --dry-run` already existed and printed the planned writes. `diff` is the
reviewable form: it groups the pending work by action (`create` / `update` /
`merge` / `refused`), shows the unified diff of the content changes, and writes
nothing. `--exit-code` makes it a check — exit `1` when the tree is out of date,
like `git diff --exit-code` — so the default exit contract is untouched and a diff
stays information rather than a failure unless you ask for it to be one.

**The preview decides by ownership, not by bytes.** `SynthPreview` reports
`overwrite` for anything the generation manifest owns, whether or not the content
differs — so reporting the preview directly called a freshly generated tree "24
documents would update", which is exactly the kind of noise that makes people stop
reading a diff. Every candidate is now compared against the bytes on disk, and
only real differences are reported. `GenerateOutcome` therefore carries `contents`
(the exact bytes each document would be written with) alongside `changes`, and the
doc comment on `changes` says plainly what it does and does not mean.

Seeded documents you own are never reported as updates — `DECISIONS.md`,
`OPEN-QUESTIONS.md`, `RISKS.md` and `prompts/` appear under "left alone", which is
the ownership rule (ADR-0016) asserted through the diff surface.
