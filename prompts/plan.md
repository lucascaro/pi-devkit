---
description: Create, evaluate, and refine an implementation plan before starting work
argument-hint: "<goal>"
---
Create an implementation plan for: $ARGUMENTS

Start with an evaluation. Do not skip this step.

Evaluate:
- Scope: small, medium, or large.
- Risk: low, medium, or high.
- Unknowns: questions or missing facts that could change the plan.
- Plan depth: lightweight or full.

Use a lightweight plan when the change is small, localized, and low-risk. Keep it short:
- Goal.
- Files to change.
- Steps.
- Tests or checks to run.
- Acceptance criteria.

Use a full plan when the change is medium or large, risky, cross-cutting, user-visible, security-sensitive, data-affecting, or ambiguous. Include:
- Goal and non-goals.
- Current-state analysis.
- Proposed approach.
- Files to change.
- Step-by-step implementation.
- Tests and validation.
- Documentation or changelog updates.
- Risks, compatibility concerns, and rollback plan.
- Acceptance criteria.
- Commands to run before shipping.

After presenting the plan, stop and ask for feedback. Refine the plan until the user explicitly accepts it. Do not start implementation until the user says "approved", "go", "implement", or an equivalent explicit approval.
