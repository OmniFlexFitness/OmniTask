---
description: Process and implement PR review feedback comments automatically
---

# PR Feedback Processing Workflow

This workflow automates the processing of pull request review comments, implementing changes and providing detailed summaries.

## Prerequisites

- GitHub CLI (`gh`) must be authenticated
- Must have write access to the repository
- PR must be in an open state

## Workflow Steps

### 1. Fetch PR Information

```bash
# Get PR number from current branch or parameter
// turbo
gh pr view --json number,headRefName,baseRefName,title,body
```

### 2. Fetch All Review Comments

```bash
# Get all review comments on the PR
// turbo
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --jq '.[] | {id, body, path, line, user: .user.login}'
```

### 3. Categorize Comments

Parse each comment and categorize by marker:

| Marker | Action |
|--------|--------|
| `[skip]` | Ignore - do not implement |
| `[critical]` | Implement first - high priority |
| `[include]` | Explicitly implement |
| `[optional]` | Create GitHub issue for later |
| (no marker) | Implement normally |

### 4. Process Critical Comments First

For each `[critical]` comment:
1. View the file at the specified path and line
2. Understand the requested change
3. Implement the fix
4. Track the comment ID for the commit message

### 5. Process Regular Comments

For each unmarked or `[include]` comment:
1. View the file context
2. Implement the requested change
3. Track the comment ID

### 6. Create Issues for Optional Items

For each `[optional]` comment:

```bash
# Create a GitHub issue
gh issue create --title "PR Feedback: [summary]" --body "From PR #X comment #Y: [full comment]" --label "enhancement"
```

### 7. Commit Changes

Use this commit message format:

```
fix: address PR review feedback

Implemented changes from review comments:
- [Author #ID] Description of change
- [Author #ID] Description of change

Skipped comments:
- [#ID] Marked as [skip] by reviewer

Created issues for optional items:
- Issue #X: Description

Co-authored-by: gemini-code-assist[bot] <gemini-code-assist[bot]@users.noreply.github.com>
```

### 8. Push Changes

```bash
# Push to the PR branch (never create a new PR)
// turbo
git push origin HEAD
```

### 9. Leave Summary Comment

```bash
# Add a summary comment to the PR
gh pr comment {pr_number} --body "## 🤖 AI Implementation Summary

### ✅ Implemented
- Comment #X by @user: [description]

### ⏭️ Skipped
- Comment #Y: Marked as [skip]

### 📋 Issues Created
- #123: [optional item description]
"
```

## Important Rules

> **🚨 NEVER create a new PR. Always push to the existing PR branch.**

- Respect all `[skip]` markers without exception
- Prioritize `[critical]` items
- Group related changes into logical commits
- Always include comment IDs in commit messages
