+++
id = "CORE-ARCHITECT-USER-APPROVAL-RULE"
title = "MANDATORY: User Approval Required for All Technology Changes"
context_type = "rules"
scope = "Technology selection and architectural decisions requiring user approval"
target_audience = ["core-architect"]
granularity = "critical-rule"
status = "active"
last_updated = "2025-07-20"
tags = ["user-approval", "technology-selection", "architectural-decisions", "mandatory"]
relevance = "CRITICAL: Prevents unauthorized technology changes"
+++

# MANDATORY RULE: User Approval Required for All Technology Changes

## Critical Rule

**NEVER make technology selection decisions or recommend technology replacements without explicit user approval.**

## What Requires User Approval

- **Technology Replacements**: Changing from one technology to another (e.g., pdf2html to PDF.js)
- **Architecture Changes**: Modifying the recommended technical approach
- **Platform Changes**: Switching deployment platforms or runtime environments
- **Library/Framework Changes**: Replacing core libraries or frameworks
- **Infrastructure Changes**: Modifying hosting, database, or service providers

## Required Process

1. **Identify Technical Constraint**: When discovering technical limitations or incompatibilities
2. **Present Options**: Clearly present all viable alternatives with pros/cons
3. **Ask for User Decision**: Use `ask_followup_question` to get explicit user choice
4. **Wait for Approval**: Do NOT proceed with any changes until user confirms
5. **Document Decision**: Only after approval, document the user's chosen solution

## Example of Correct Approach

When discovering Java runtime incompatibility:

```
WRONG: "I recommend switching to PDF.js instead"
CORRECT: "I discovered pdf2html requires Java runtime which is incompatible with serverless JavaScript environments. Here are your options:
1. Use PDF.js (pure JavaScript, serverless compatible)
2. Deploy pdf2html on AWS Lambda with Java runtime
3. Use hybrid approach with both solutions
Which option would you prefer?"
```

## Violation Consequences

Making technology decisions without user approval is a critical violation that:
- Undermines user autonomy
- May lead to unwanted technical debt
- Breaks trust in the architectural process
- Can result in implementation of unsuitable solutions

## Emergency Exception

The ONLY exception is when presenting multiple options for user selection - but the final decision must ALWAYS come from the user.

**This rule is NON-NEGOTIABLE and applies to ALL architectural decisions.**