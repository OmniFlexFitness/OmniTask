# draft-pr

Slash-command workflow that generates a clean PR description from current git state. Trigger with `/draft-pr` in Antigravity.

## Goal

Produce a paste-ready PR description summarizing local changes against the target branch (default: `main`), formatted for OmniFlex's GitHub PR template.

## Steps

1. **Determine target branch**
   - If the current branch has an upstream tracking branch, use the merge base of HEAD and the upstream
   - Otherwise default to `main`
   - If `main` does not exist, fall back to `master`
   - Surface the chosen target branch to the user before proceeding

2. **Gather diff**
   - Run `git diff {target_branch}...HEAD --stat` to get the file-level summary
   - Run `git log {target_branch}..HEAD --oneline` to get commit history on this branch
   - Run `git diff {target_branch}...HEAD` to get full diff (token-budget permitting)
   - If the diff exceeds 50 files, summarize from the stat output and commit messages rather than reading every file

3. **Categorize changes**
   - Identify which features/areas are touched based on file paths under `lib/features/` or `functions/`
   - Identify whether changes include: new files, deletions, renames, breaking API changes
   - Identify whether tests, docs, or both are updated

4. **Compose PR description**

   Use the OmniFlex PR template:

   ```markdown
   ## Summary

   [1-2 sentence description of what this PR does, in OmniFlex Voice — direct, no hype]

   ## Changes

   ### What
   - [Bulleted list of technical changes, grouped by feature/area]
   - [Each bullet specific enough to understand without reading the diff]

   ### Why
   - [Reasoning behind each non-obvious change, inferred from commits and code comments]
   - [Link any related Obsidian notes or GitHub issues if found in commit messages]

   ## Testing

   - [How these changes were verified]
   - [What new tests were added]
   - [What manual testing the reviewer should do, if any]

   ## Notes

   - [Any caveats, follow-ups, or known limitations]
   - [Anything the reviewer should pay extra attention to]
   - [Brand/UX/security implications worth flagging]

   ## Checklist

   - [ ] `flutter analyze` passes
   - [ ] `flutter test` passes
   - [ ] No new packages in `pubspec.yaml` without justification
   - [ ] Brand tokens used (no hardcoded colors/typography)
   - [ ] Firestore rules updated if the diff touches new collections
   - [ ] Documentation updated if public API changed
   ```

5. **Output**
   - Place the rendered description in a single Markdown code block
   - The user copies it into the PR body on GitHub
   - Do not push the PR for the user; they create the PR themselves

## Constraints

- Plain ASCII; no smart quotes or em dashes
- "What" is technical; "Why" is reasoning; "Testing" is how to verify; "Notes" is context
- No marketing language, no hype words
- If a change has unclear motivation from commits/code, surface that as a "needs author input" note rather than fabricating a reason
- If the branch has no commits diverging from target, output a single message: "No changes detected against {target_branch}. Are you on the right branch?"

## Example Output

```markdown
## Summary

Adds the rest timer widget for the workout logger and wires it into the active workout view.

## Changes

### What
- New widget at `lib/features/workout/presentation/widgets/rest_timer.dart` with countdown, pause, and skip actions
- Riverpod provider `restTimerProvider` for timer state
- Integration into `WorkoutScreen` between exercise sets
- Widget test at `test/features/workout/widgets/rest_timer_test.dart`

### Why
- Rest timing was a top-3 user request from the closed beta survey (see `C:/OmniFlex Vault/Research/nexus-beta-feedback.md`)
- Implementing as a self-contained widget keeps it reusable for future supersets feature

## Testing

- `flutter analyze` and `flutter test` pass
- Manually tested: countdown completes, pause/resume works, skip advances workout state, app backgrounding preserves remaining time
- Reviewer: please verify haptic feedback fires on countdown completion (only testable on physical device)

## Notes

- Did not add iOS-specific haptic patterns; uses Flutter's default. Can revisit if iOS feels weak
- Timer accuracy: ~50ms drift over 5 minutes. Acceptable for the use case but flagged for future
```

## Failure Modes

- **No commits to summarize**: surface the message and stop
- **Diff too large to read fully**: summarize from stats and commits; flag at the top of the output
- **Conflicting commit messages**: when multiple commits touch the same area with different stated reasons, list both and let the user reconcile
