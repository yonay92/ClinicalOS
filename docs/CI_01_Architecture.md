# Clinical Intelligence 01 - Architecture

## Purpose

Clinical Intelligence is a platform of specialized AI agents coordinated by Business Rules.

## Principles

- AI suggests, never silently changes production data.
- Every AI action is logged.
- Human approval is required for operational changes.
- AI agents are independent services.

## Pipeline

Trigger → Context Collection → AI Analysis → Confidence Score → User Review → Business Rules → Database Update → Audit Trail

## Shared Context

Agents may access only authorized company/site data.
