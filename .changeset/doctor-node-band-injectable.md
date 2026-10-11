---
'planmo': patch
---

Make `planmo doctor`'s Node version band testable by allowing the version to be
injected. The command still judges the running Node by default; the tests now pin
a supported version instead of inheriting the host's, so the suite is green on any
Node the project permits (>= 24) rather than only on the LTS line.
