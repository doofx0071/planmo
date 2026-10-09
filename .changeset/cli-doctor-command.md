---
'@planmo/trace': patch
'planmo': minor
---

`planmo doctor` — environment and workspace health, and the package-manager bug
that had to be fixed before it could be wired.

```console
$ planmo doctor
environment:
  node            v24.11.0
  package manager pnpm
  git worktree    clean
  prompts missing 0
doctor: OK (0 error(s), 0 warning(s), 0 info)
```

**The bug.** `doctorEngine()` hardcoded `expected "pnpm"` and raised **DOC-003 as
an error** for anything else. That is correct for this repository, where pnpm is
the convention, and wrong for every other project — a Python service, a Go binary,
a Rust crate would each have been told their package manager was an error. It
could not be wired as it stood without shipping false failures.

The engine no longer invents an expectation. `DoctorInput.expectedPackageManager`
is optional: supplied, a mismatch is an error as before; absent, the engine stays
silent, because there is nothing to judge. Silence rather than an `info`
diagnostic is deliberate — it keeps the engine's existing "a clean environment
reports nothing" property intact, and the CLI prints the resolved facts itself:

```console
$ planmo doctor          # in a project with a poetry.lock
  package manager poetry
doctor: OK (0 error(s), 0 warning(s), 0 info)
```

**The adapter** (`packages/planmo/src/doctor.ts`) resolves the facts the engine
cannot know, the same shape as `validate` over the same package:

- Node version from the runtime.
- Package manager detected from the lockfile (pnpm, bun, yarn, npm, uv, poetry,
  pipenv, cargo, go, bundler, composer) — most specific first, `unknown` when
  there is none. Reported, never judged.
- Git worktree state via `git status --porcelain`. A failing `git` (not a repo, no
  git installed) is reported as clean rather than as an error: not having git is
  not a health problem here.
- Missing next-phase prompt file: the workspace state names one, so if it is
  absent that is a real gap; if the state names none, there is nothing to check.

`doctor` exits `0` unless the environment genuinely fails (`1`), and `3` with no
workspace — so it works as a pre-flight check without turning a warning into a
build failure.
