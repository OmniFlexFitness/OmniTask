---
description: Create a Pull Request for the current feature branch after all changes are committed and pushed
---

# Creating a Pull Request

// turbo-all

Follow these steps to create a PR from the current feature branch:

## 1. Verify Clean Working Tree
Ensure all changes are committed and pushed:

```bash
git status --short
git branch --show-current
```

If there are uncommitted changes:
```bash
git add -A
git commit -m "<appropriate commit message>"
```

## 2. Push to Remote
Ensure all commits are pushed to the remote branch:

```bash
git push origin $(git branch --show-current)
```

## 3. Determine Base Branch
- Default base branch: `live`
- If the user specifies a different base branch, use that instead

## 4. Generate PR Title and Body
Based on the commits on the branch, create a descriptive PR:

- **Title**: Use conventional commit format (e.g., `fix:`, `feat:`, `refactor:`, `style:`)
- **Body**: Include:
  - `## Summary` — brief description of the changes
  - Grouped sections by area (e.g., ### Frontend, ### Backend, ### CI/CD)
  - Bullet points for each change
  - Reference any related issues with `#issue-number`

## 5. Create the PR
Use the GitHub CLI to create the PR:

```bash
gh pr create --base <base-branch> --head <feature-branch> --title "<title>" --body "<body>"
```

## 6. Link the PR
After the PR is created, output the PR URL so the user can review it.

## Notes
- Always create the PR against `live` unless told otherwise
- Never create a duplicate PR if one already exists for the branch — use `gh pr list --head <branch>` to check first
- If a PR already exists, update it with `gh pr edit <number>` instead
