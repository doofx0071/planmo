# Secure Filesystem Operations

All generated writes go through one safe writer abstraction handling:
- root containment;
- normalization;
- symlinks;
- ownership;
- collisions;
- atomic write;
- hashing;
- dry run;
- diff;
- rollback metadata where relevant.

Other packages must not directly write generated project artifacts.
