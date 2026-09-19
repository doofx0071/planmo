# Execution Graph

Workflow state is a DAG.

Task metadata:
- dependencies;
- phase;
- parallel-safe;
- human-gate;
- security-sensitive;
- required evidence;
- owning requirement IDs.

A phase can fan out to worker packets and fan in for coordinator integration.
