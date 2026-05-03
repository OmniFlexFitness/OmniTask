---
name: omniflex-code-review
description: Use when reviewing a Flutter or Firebase code change before commit, before merge to main, or as a pre-deployment audit. Activates on prompts asking to review a diff, check a PR, audit a feature, or verify code is ready to ship. Runs the OmniFlex code review checklist covering null safety, Firebase error handling, brand consistency, accessibility, performance, and OmniFlex-specific footguns. Always finishes the full checklist even if early findings look severe.
---

# OmniFlex Code Review

A consistent review pass that catches OmniFlex-specific footguns and enforces conventions from `AGENTS.md`.

## Activation Triggers

Activate when a prompt mentions:
- Reviewing a diff, PR, or commit
- Auditing code before deployment
- Checking if a feature is ready to ship
- Verifying changes against OmniFlex standards
- "Looks good?" or "ship it?" — run the checklist anyway

## Hard Rule

**Always complete the full checklist.** Do not short-circuit on the first finding. Do not skip categories that "obviously look fine." The point of the checklist is to catch what looks fine but isn't.

## Checklist

See `checklist.md` for the full list. Categories:

1. **Null safety**
2. **Firebase error handling**
3. **Brand consistency**
4. **Accessibility**
5. **Performance**
6. **Security rule alignment**
7. **Test coverage**
8. **OmniFlex-specific footguns**

## Output Format

Report findings in a single structured response:

```
# Review: {feature/commit/PR title}

## Overall: [SHIP / FIX FIRST / NEEDS DISCUSSION]

## Findings

### Null safety
- [Finding 1 with file:line reference]
- (or: "Pass — no issues found")

### Firebase error handling
- ...

[continue for all 8 categories]

## Recommendations (in priority order)
1. [Highest-priority fix]
2. [Next fix]
3. [Optional improvements]

## Test additions suggested
- [Specific test cases to add before merge]
```

Findings include file paths and line numbers when applicable. "Looks fine" is not a finding; either the category passes (state that explicitly) or there's a specific issue with a location.

## Verdict Rubric

- **SHIP**: no findings in any category, or only minor optional improvements suggested
- **FIX FIRST**: any finding in null safety, Firebase error handling, security rules, or OmniFlex footguns; any test gaps for new features
- **NEEDS DISCUSSION**: findings that involve architectural choices, third-party package additions, or anything outside the reviewer's scope to decide alone

Never report SHIP unless the full checklist has been run. If the user pushes for a faster verdict, complete the checklist anyway and surface findings.

## What This Review Does Not Cover

- Whether the feature itself is a good idea (that's product decision, not code review)
- Whether the implementation matches a Figma design pixel-perfect (visual review is separate; have the user verify in Antigravity's integrated browser)
- Whether business logic is correct beyond what's documented in the spec (you can flag suspicious logic but cannot validate against unstated requirements)
