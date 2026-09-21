#!/usr/bin/env python3
"""Synthetic helper script for the brownfield fixture (never executed)."""

import json
import sys


def main() -> int:
    payload = {"fixture": "brownfield", "language": "python"}
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())