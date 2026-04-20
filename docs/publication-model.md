# Contracts Publication Model

## Purpose

This document describes what this public repository is for, and what it is not
for.

## Public repository goals

This repository exists to publish the contract material required for:

- public review of Solidity sources
- reproducible deployment inputs
- public verification of deployed contracts
- ABI and deployment artifact distribution

## Non-goals

This repository is not intended to be the primary place for:

- internal implementation planning
- detailed engineering task tracking
- private rollout notes
- application-specific environment wiring
- operational runbooks that expose unnecessary internal context

## Recommended development flow

The recommended model is:

1. evolve contracts and deployment tooling in the private development repository
2. validate changes there with the normal engineering workflow
3. export the public-safe contract, deployment, and verification material to this repository
4. run or publish deployment artifacts from the controlled deployment flow
5. publish release tags, address books, and verification manifests here

## What should be published here

- contract sources
- public deployment scripts and workflows
- bundled sources used by the real deploy path
- ABI outputs
- release-aligned address books
- verification manifests
- concise public documentation

## What should stay private

- internal task breakdowns
- agent-facing work logs
- detailed rollout notes for private consumers
- local environment synchronization scripts
- secrets and operational credentials
