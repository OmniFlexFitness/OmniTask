---
description: How to resume an interrupted agent task and recover context
---

# Resuming Interrupted Agent Tasks

// turbo-all

When an agent task is interrupted mid-operation (e.g., user cancelled, connection lost, context switch), follow these steps to resume:

## 1. Check Current State
Assess the workspace state to understand where you left off:

```bash
git status
git branch --show-current
git log --oneline -5
git diff --stat
```

## 2. Review Conversation Context
- Read the **conversation summary** at the top of the truncated context (if present)
- Check the **task.md** artifact for the last checklist state
- Review any **implementation_plan.md** for the original plan
- Check **walkthrough.md** for what was already documented as complete

## 3. Identify Pending Work
- Look for `[/]` (in-progress) items in task.md
- Check for uncommitted changes via `git diff`
- Check for unstaged files via `git status`
- Review any running terminal commands

## 4. Resume Execution
- Update `task.md` to reflect current state
- Call `task_boundary` with appropriate mode and status
- Continue from the last incomplete step
- If the interrupted operation was a file edit, verify the file state before re-editing

## 5. Verify Continuity
- Run build/lint checks if code was modified
- Ensure no partial edits left the codebase in a broken state
- If a file edit was interrupted mid-operation, view the file to check for corruption

## Common Recovery Patterns

### Interrupted File Edit
1. View the file to check if the edit was applied
2. If partially applied, fix the remaining changes
3. If not applied, retry the edit

### Interrupted Git Operation
1. Check `git status` for merge conflicts or pending operations
2. Resolve conflicts if present
3. Complete the commit/push cycle

### Interrupted Build/Test
1. Re-run the build or test command
2. Address any new failures

### Interrupted Browser Verification
1. Take a fresh screenshot to see current state
2. Compare with expected result
3. Continue from verification step
