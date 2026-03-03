---
description: Review PR comments/reviews, triage actionable feedback, implement fixes, and push updates to the existing branch
---

# Review and Revise PR

Fetch PR review comments, evaluate which are worth implementing, apply fixes, and push as a new commit to the same branch (no new PR).

## Task Breakdown

### Task 1: Identify the PR

Determine which PR to review. If not specified, check the current branch:

// turbo
```bash
gh pr list --head "$(git branch --show-current)" --json number,title,state --jq '.[] | "\(.number): \(.title) [\(.state)]"'
```

If no PR is found on the current branch, list all open PRs:

// turbo
```bash
gh pr list --state open --json number,title,headRefName --jq '.[] | "#\(.number) [\(.headRefName)]: \(.title)"'
```

---

### Task 2: Fetch PR Reviews and Comments

Get the top-level review summaries:

// turbo
```bash
gh pr view <PR_NUMBER> --json reviews --jq '.reviews[] | {author: .author.login, state: .state, body: .body}'
```

Get inline code review comments (the most actionable ones):

// turbo
```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --jq '.[] | {path: .path, line: .line, body: .body, author: .user.login}'
```

> **Tip**: If output is long, redirect to a file and read it:
> ```bash
> gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --jq '.[] | {path: .path, line: .line, body: .body, author: .user.login}' > pr_inline_comments.txt
> ```

---

### Task 3: Triage Comments

For each comment, categorize it:

| Category | Action |
|----------|--------|
| **Bug / Memory Leak / Security** | ✅ Always implement |
| **Error handling improvement** | ✅ Usually implement |
| **Dead code / unused imports** | ✅ Quick win, implement |
| **Style / naming preference** | ⚠️ Implement if easy, skip if subjective |
| **Architecture suggestion** | ⚠️ Evaluate scope — may need a separate PR |
| **Bot boilerplate / info-only** | ❌ Ignore |

Present a summary table to the user before proceeding:

```
| # | Source | Issue | Priority | Decision |
|---|--------|-------|----------|----------|
| 1 | ...    | ...   | ...      | ✅/❌    |
```

---

### Task 4: Ensure on Correct Branch

// turbo
```bash
git checkout <BRANCH_NAME>
git pull origin <BRANCH_NAME>
```

---

### Task 5: Implement Fixes

Apply the accepted review suggestions. Common patterns:

- **Memory leaks**: Add cleanup functions to `useEffect`, revoke object URLs
- **Error handling**: Replace empty `catch {}` with `console.warn()`
- **Dead code**: Remove unused CSS classes, imports, variables
- **Type safety**: Replace `any` with proper types

---

### Task 6: Verify Changes

// turbo
```bash
npx tsc --noEmit
```

// turbo
```bash
npm run build
```

---

### Task 7: Commit and Push

Stage only the files you modified for review fixes:

```bash
git add <FILES>
git commit -m "fix: address PR review feedback - <brief summary>

- Fix 1 description
- Fix 2 description
- Fix 3 description"
```

Push to the same branch (updates the existing PR automatically):

```bash
git push origin <BRANCH_NAME>
```

---

### Task 8: Respond to Comments and Resolve Threads

After pushing the fixes, reply to the review comments to explain how they were addressed.

// turbo
```bash
# General PR comment stating all issues are resolved
gh pr review <PR_NUMBER> --comment -b "All actionable feedback has been implemented and pushed. Marking threads as resolved."
```

> **Note**: To reply to specific inline comments, you can use the GitHub API:
> ```bash
> gh api -X POST repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies -f body="Implemented as suggested."
> ```

---

### Task 9: Verify CI Passes

// turbo
```bash
gh pr checks <PR_NUMBER>
```

---

### Task 10: Clean Up Temp Files

Remove any temporary files created during review:

// turbo
```bash
rm -f pr_inline_comments.txt pr_reviews.txt pr_comments.txt
```

---

## Notes

- **Never create a new PR** for review fixes — push to the same branch
- Use conventional commit format: `fix: address PR review feedback`
- If a review comment suggests an architectural change that's too big, note it for a follow-up PR
- Bot comments (Gemini Code Assist info, Codex setup info) are informational — focus on actual code suggestions
- After pushing, CI will re-run automatically on the updated PR
