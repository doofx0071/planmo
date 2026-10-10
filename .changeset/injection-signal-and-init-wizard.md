---
'planmo': patch
'@planmo/scanner': patch
---

Stop the injection report crying wolf, and make the init wizard selectable.

Running `adopt` on a real project reported **29 of 151 files as containing
prompt-injection-like content**. They were ordinary files. The marker set treated
markup as intent:

- `/*` and `<!--` were standalone markers — present in every file with a JSDoc
  header and every README with a badge;
- `you must` was an INJ-002 "authority claim" — ordinary English;
- `system:` and `!!!` were markers — common in configs, logs and prose.

Two markers meant **poisoned**. A three-file project containing nothing but a JSDoc
comment and a README saying "You must run `npm install`" reported _1 poisoned, 1
suspicious_ and a warning.

Markup is now evidence only on a line that also carries an instruction phrase
(PLN-005), `you must obey` replaced `you must`, and `system:`/`!!!` are gone. The
same benign fixture now reports 0 poisoned, 0 suspicious.

Narrowing a detector is how you get one that misses the real thing, so each
narrowed rule has a paired test: `/* you must obey */` is still poisoned (the
hiding is a second marker), and the detector now also catches **"ignore all previous
instructions"** — the most common phrasing, and not a substring of the phrase it
already knew, so it had been sailing straight through.

`init` asks Type, Lifecycle, Risk and Primary agent as **arrow-key menus** with the
recommended option labelled and listed first, so Enter accepts it and the
alternatives are visible. `[]` now means _recommended_, and a line says so.
