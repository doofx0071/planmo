# Filesystem Safety

1. Resolve project root once.
2. Canonicalize every output path.
3. Reject root escape.
4. Define symlink behavior.
5. Never blindly follow repo-controlled symlinks on write.
6. Prefer temp-file + atomic rename.
7. Record managed files in manifest.
8. User-owned files produce conflict/diff, not overwrite.
9. `--force` never bypasses path/symlink security.

Required tests:
- `../` traversal;
- absolute path injection;
- Windows drive/UNC edge cases;
- symlink escape;
- case collisions;
- interrupted write;
- concurrent generation;
- malformed manifest.
