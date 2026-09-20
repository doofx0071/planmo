# Repository Context Map

## Purpose

Provide a compact structural understanding of a repository before full-file reads.

## Contents

- packages/apps;
- important files;
- exported/public symbols;
- symbol signatures;
- import/dependency edges;
- tests associated with implementation;
- relevant documentation;
- ownership/managed-file class;
- stack/framework metadata.

## Ranking

A context query can rank nodes by:
- direct mention;
- dependency graph proximity;
- task/path ownership;
- symbol references;
- change frequency;
- test linkage.

## Token efficiency

The context map should return signatures and relationships before function bodies. Agents can request full source only when needed.

## Rebuildability

The map is an index, not canonical state. It must be safe to delete and rebuild.
