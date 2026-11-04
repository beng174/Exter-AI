# Execution plans

Use an ExecPlan for complex features or significant refactors. Write it before
implementation and keep it as a self-contained living document under .agent/plans/.
A newcomer must be able to continue from the plan and repository alone. Define
terms, exact paths, commands, expected results and safe rollback. Product behaviour
comes from research/PRODUCT-SPEC.md. User scope takes precedence over the schedule.
Never treat a plan, fixture or model confidence as evidence of a completed live gate.

Every plan must contain these sections, in this order:

## Purpose and big picture
Explain the user-visible outcome and the authorised scope in plain language.

## Progress
Use timestamped checkbox items in UTC. Split completed work from remaining work.
Update after each meaningful change; tick only after its acceptance checks pass.

## Surprises and discoveries
Record findings with concrete evidence, paths and implications, including blockers.

## Decision log
Record date, decision, alternatives and reason. Explain specification conflicts.

## Outcomes and retrospective
State what works, evidence, limitations and follow-up. Never overstate validation.

## Context and orientation
Describe relevant modules, data stores, entry points and terms for a newcomer.

## Plan of work
List small demoable milestones, files, dependencies and acceptance criteria.

## Concrete steps
Give commands from the repository root, prerequisites and expected output.
Keep secrets out of commands and logs. Distinguish local from production actions.

## Validation and acceptance
Describe visible behaviour and tests, including empty and failure paths. Record
actual results and screenshot locations; separate fixtures from live verification.

## Idempotence and recovery
Explain safe retries, retained data, rollback and how to recover interrupted work.

## Interfaces and dependencies
Name contracts and dependencies. State what must remain unchanged and which
external approvals or human inputs prevent release. No hidden setup assumptions.
