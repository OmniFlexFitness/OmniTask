---
description: Resolve merge conflicts by checking out the branch, pulling the target branch, fixing conflicts, and pushing
---

# Resolve Merge Conflicts

This workflow helps you safely and cleanly resolve merge conflicts when a feature branch conflicts with a main branch (like `live`).

## Prerequisites

Ensure you have a clean working tree before starting. If you have uncommitted changes, stash or commit them.

## Workflow Steps

### 1. Identify Target and Source Branches

Determine the branch that has the merge conflicts (e.g., `feature/my-feature`) and the target branch it's trying to merge into (e.g., `live`).

- **Target Branch**: Typically `live` or `main`.
- **Source Branch**: The feature branch with your work.

### 2. Update Target Branch

Ensure you have the latest code from the target branch.

// turbo
```bash
git checkout live
git pull origin live
```

*(Replace `live` with your target branch if different)*

### 3. Switch to Source Branch and Merge

// turbo
```bash
git checkout <SOURCE_BRANCH>
git pull origin <SOURCE_BRANCH>
```

Initiate the merge from the target branch to trigger the conflicts locally:

// turbo
```bash
git merge live
```

### 4. Identify Conflicted Files

Check which files have conflicts:

// turbo
```bash
git status --porcelain
```

Conflicted files will be marked with `UU` (both modified) or similar unmerged states.

Alternatively, search for conflict markers:

```bash
git --no-pager grep -n "<<<<<<< HEAD"
```

### 5. Resolve Conflicts Manually

Open each conflicted file and look for the conflict markers:
- `<<<<<<< HEAD` (your current branch's changes)
- `=======` (separator)
- `>>>>>>> live` (incoming changes from the target branch)

**Resolution Strategy**:
1. Read both sides of the conflict.
2. Determine which changes to keep, or manually combine them.
3. Completely remove the `<<<<<<<`, `=======`, and `>>>>>>>` marker lines.
4. Save the file.

*(If using an AI assistant, use file editing tools to replace the conflicted chunks with the properly resolved code).*

### 6. Verify Resolution

Before committing, ensure the code builds and passes basic checks:

// turbo
```bash
npx tsc --noEmit
npm run build
```

*(Run whatever build or linting commands are appropriate for the repository)*

### 7. Commit the Merge

Stage the resolved files and complete the merge commit:

// turbo
```bash
git add .
git commit -m "Merge branch 'live' into <SOURCE_BRANCH> with conflict resolutions"
```

*(If the merge was initiated with `--no-commit`, or if you are resolving after a conflict paused the merge, `git commit` without a message usually opens up the default merge message editor, or you can provide the message as shown).*

### 8. Push Back to Remote

Push the resolved branch back up to origin. This will update the open Pull Request and resolve the conflicts on GitHub.

// turbo
```bash
git push origin <SOURCE_BRANCH>
```

## Tips

- If the conflict is too complex and you want to abort the merge and start over:
  `git merge --abort`
- If you want to automatically accept the incoming changes for a specific file (use with caution):
  `git checkout --theirs <FILE_PATH>`
- If you want to automatically accept your own changes for a specific file (use with caution):
  `git checkout --ours <FILE_PATH>`
