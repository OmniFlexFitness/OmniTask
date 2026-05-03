# OmniFlex Code Review Checklist

Run every category. Report findings or pass for each.

---

## 1. Null Safety

- [ ] No `!` operators without an inline comment justifying the assertion
- [ ] No `dynamic` types except where interfacing with untyped JSON (and then with explicit casts soon after)
- [ ] No `late` variables that could be initialized in `initState` instead
- [ ] All `AsyncValue` consumers handle `data`, `loading`, AND `error` states (no `value!` calls)
- [ ] Function return types and parameters are non-nullable wherever possible; nullability is intentional, not lazy
- [ ] No `String?` where empty string would suffice and simplify downstream code

## 2. Firebase Error Handling

- [ ] Every Firestore call (`get`, `set`, `update`, `delete`, `add`) has a try/catch with explicit handling
- [ ] FirebaseException catches are typed: `on FirebaseException catch (e, stack)` not bare `catch (e)`
- [ ] Errors are logged with context (which document, which user, what operation)
- [ ] Errors are surfaced to the user via the standard error UI, not swallowed silently
- [ ] Cloud Function calls have timeouts configured; defaults are too long for mobile UX
- [ ] Storage uploads handle interruption (network drop, app backgrounding)
- [ ] Auth state changes invalidate cached data appropriately

## 3. Brand Consistency

- [ ] No hardcoded color values (`Color(0xFF...)`, `Colors.blue`, hex strings) — must use `OmniFlexColors`
- [ ] No hardcoded text styles — must use `OmniFlexTypography`
- [ ] No hardcoded spacing values — must use `OmniFlexSpacing` (8pt grid)
- [ ] Glow effects use `OmniFlexEffects.neonGlow` not custom `BoxShadow` recreations
- [ ] No corporate-feeling language in user-facing strings ("welcome to your fitness journey" — flag and rewrite)
- [ ] Empty states feel intentional, not default Material placeholder
- [ ] Loading states use OmniFlex's pulsing-glow loader, not default `CircularProgressIndicator`

## 4. Accessibility

- [ ] Interactive widgets have `Semantics` labels or use widgets that provide them by default
- [ ] Touch targets minimum 48×48 logical pixels (custom buttons explicitly enforce; default Material widgets already do)
- [ ] Text contrast against the dark cyberpunk background meets WCAG AA — check against `OmniFlexColors.deepBackground`
- [ ] No information conveyed by color alone (state changes paired with icon or text)
- [ ] Glow intensity is decorative; never carries information
- [ ] Form fields have visible labels (not just placeholder text)
- [ ] Error states announced to screen readers via `Semantics(liveRegion: true)`

## 5. Performance

- [ ] `const` constructors used wherever possible
- [ ] `ListView.builder` (or equivalent lazy builder) for any list with more than ~20 items
- [ ] No expensive work in `build()` (network calls, file I/O, heavy computation)
- [ ] Animations use `AnimatedBuilder` / `AnimationController` rather than rebuilding parent widgets
- [ ] Image assets sized appropriately; no 4096px hero images on mobile
- [ ] `flutter analyze` passes with zero warnings (not just zero errors)
- [ ] No `setState` calls outside the widget that owns the state

## 6. Security Rule Alignment

- [ ] If the change touches Firestore reads/writes, the relevant collection is covered by rules in `firestore.rules`
- [ ] New fields written by the client are present in the rule's `fieldsAreSubsetOf` allow-list
- [ ] If the change adds a new collection, rules exist before merge — never deploy app code that writes to an unprotected collection
- [ ] `allow list` is set explicitly for collections the client queries (not just `allow read`)
- [ ] Test cases (positive and negative) exist in the rules test file or emulator-tested by hand

## 7. Test Coverage

- [ ] Every new public widget has at least one widget test
- [ ] Every new feature has at least one happy-path integration test
- [ ] State management providers have unit tests where logic is non-trivial
- [ ] Tests pass: `flutter test` runs clean
- [ ] Test names are descriptive: `test('rest timer counts down from configured duration')`, not `test('test rest timer')`
- [ ] No commented-out tests; either fix them or delete them with a note

## 8. OmniFlex-Specific Footguns

- [ ] **`pubspec.yaml` unchanged** unless the change explicitly justifies a new package
- [ ] **`firebase.json`, `firestore.rules`, `storage.rules` diffs reviewed manually** — these touch security, treat with care
- [ ] **`analysis_options.yaml` unchanged** unless lint config change is the explicit purpose of the PR
- [ ] **No new top-level routes** outside the established `go_router` config
- [ ] **No deletion of tests** to make CI pass
- [ ] **No `// ignore:` comments** without justification naming the lint rule and reason
- [ ] **No `print()` statements** — use the logger
- [ ] **No `debugPrint()` left in production code paths** (review-only callouts are fine)
- [ ] **No commented-out code** unless paired with a TODO and ticket reference
- [ ] **No App Check bypass code** committed (debug tokens are fine; bypass code is not)
- [ ] **No personally identifiable info in logs** — Firebase log streams are not GDPR-clean by default
- [ ] **No hardcoded API keys, secrets, or tokens** — environment variables or Firebase config only
