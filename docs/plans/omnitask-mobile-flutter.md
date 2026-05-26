# OmniTask Mobile (Flutter) — Implementation Plan

## Context

You want a mobile companion to OmniTask that is synced with the web app via the
shared Firebase backend (`omnitask-475422`). After exploration we confirmed:

- The web app is **Angular 21** (signals, standalone components, Tailwind dark
  theme) with no existing PWA, Capacitor, Flutter, or service-worker setup.
- The backend is already a **Firebase-first hybrid**: clients talk directly to
  Firestore for CRUD; Cloud Functions handle Google API integration, AI
  (Vertex Gemini), email triggers, and privilege enforcement. There are 13
  callable / scheduled / trigger functions in `functions/src/index.ts`.
- OmniFlex already has Flutter projects elsewhere — the
  `.antigravity/skills/omniflex-code-review/checklist.md` is Flutter-tuned and
  references `OmniFlexColors`/`Typography`/`Spacing`/`Effects`,
  Riverpod's `AsyncValue`, `go_router`, `pubspec.yaml`, and App Check.
- You picked **Flutter** for native UX and ecosystem fit; iOS + Android at
  parity; v1 must include push, offline, core CRUD, and native
  share/camera/files.

Feasibility verdict: yes — Flutter is feasible and the better strategic fit
than PWA/Capacitor given the existing OmniFlex Flutter investment. Honest
scope: this is roughly 3–6 months of work to a polished v1 in both stores. The
right first milestone is a **thin v1** (Phases 0–2, read + tasks-write,
TestFlight/Internal Testing only) before committing to push, native features,
and store submission.

---

## Recommended Approach

### Repo: monorepo `mobile/` subdirectory

Add `mobile/` to this repo rather than splitting into `omnitask-mobile`.
Reasons:

- FCM-related Cloud Function changes must ship in lock-step with the mobile
  client that depends on them; one repo means one PR.
- `firestore.rules` and `firestore.indexes.json` are shared — schema PRs are
  auditable in a single diff.
- The Cloud Run deploy workflow (`.github/workflows/deploy-cloudrun.yml`)
  triggers only on push to `live` and only builds the Angular app, so adding
  `mobile/` cannot break the existing deploy chain. Verify by adding (or
  updating) `.dockerignore` to exclude `mobile/`.
- The OmniFlex code-review skill is path-scoped and will run automatically
  against `mobile/`.

### Stack

- **Flutter** stable (3.27+, Dart 3.6+) pinned via `mobile/.fvmrc`.
- **State management**: Riverpod 2.x + `riverpod_generator` (matches
  `AsyncValue` references in the OmniFlex checklist).
- **Routing**: `go_router` (the checklist mandates "no new top-level routes
  outside the established `go_router` config").
- **FlutterFire**: `firebase_core`, `firebase_auth`, `cloud_firestore`,
  `cloud_functions`, `firebase_storage`, `firebase_messaging`,
  `firebase_app_check`.
- **Native**: `google_sign_in`, `image_picker`, `file_picker`, `share_plus`,
  `receive_sharing_intent`, `flutter_local_notifications`, `path_provider`,
  `logger`.

### Package layout (mirrors `src/app/features/`)

```
mobile/
  lib/
    main.dart
    app.dart
    core/{auth,firestore,cloud_functions,messaging,logging,router}/
    features/{dashboard,my_tasks,projects,tasks,schedule,settings,user_groups}/
    models/
  packages/omniflex_design_system/
  test/
  integration_test/
  android/
  ios/
  pubspec.yaml
  analysis_options.yaml
```

### Backend reuse — zero changes for v1 CRUD

Every collection mobile needs (`users`, `projects`, `tasks`,
`users/{uid}/{contacts,recurringTasks,weeklyBlocks,customFields}`,
`userGroups`, `notifications`) is already gated by `firestore.rules` with the
same auth model. Mobile reads/writes them directly via `cloud_firestore`.

Callables mobile invokes (already deployed): `manualGoogleTasksSync`,
`getWorkspaceContacts`, `searchWorkspaceContacts`, `generateSubtasks`,
`suggestTaskPriority`, `suggestDueDate`, `enhanceTaskDescription`. Verify each
function's region in `functions/src/index.ts` and pass the matching region to
`FirebaseFunctions.instanceFor(region: ...)`.

### Auth

`google_sign_in` → `firebase_auth` credential, with the same multi-scope
list the Angular `AuthService` uses (Tasks, Contacts, Sheets, Drive). The
access token returned matches what `manualGoogleTasksSync` and the contacts
callables expect — same contract as web. Refresh tokens stay server-side
unchanged.

iOS: reversed-client-id URL scheme in `Info.plist`, `GoogleService-Info.plist`,
APNS entitlement. Android: SHA-1/SHA-256 fingerprints (debug, Play upload, Play
app-signing) registered in Firebase console; `google-services.json` per
flavor; bundle id `com.omniflex.omnitask` (lock now).

### Push notifications — only new backend work for v1

Schema:

- `users/{uid}/fcmTokens/{tokenId}` subcollection — `{ token, platform,
  createdAt, lastSeenAt, appVersion }`. Subcollection (not array) avoids
  document-rewrite contention and supports TTL of stale tokens.

`firestore.rules`: add `match /users/{uid}/fcmTokens/{tokenId}` allow read /
write `if isOwner(uid)`.

New Cloud Function (sibling to `sendTaskAssignmentEmail` in
`functions/src/index.ts`): `sendTaskAssignmentPush` — `onDocumentWritten` on
`tasks/{taskId}`. On assignee change, fan out via
`admin.messaging().sendEachForMulticast(...)` and prune
`messaging/registration-token-not-registered` results.

Mobile: `firebase_messaging` background handler (top-level function, calls
`Firebase.initializeApp()` itself), `flutter_local_notifications` for
foreground display, token write on login + `onTokenRefresh`, token delete on
logout, deep-link via `go_router` to `/tasks/:id`. Web FCM is out of scope
for mobile v1 (additive later).

### Offline mode

`cloud_firestore` enables offline persistence by default on iOS/Android. Tune
`Settings(persistenceEnabled: true, cacheSizeBytes: CACHE_SIZE_UNLIMITED)`.
Use `FieldValue.increment` for counters (e.g., `subtaskCount`) and
`arrayUnion`/`arrayRemove` for `assigneeIds` — last-write-wins on whole-field
overwrites is the failure mode to design around. `serverTimestamp()` resolves
on flush, so any client-side `createdAt` ordering must fall back to local time
when offline.

### Native features

`image_picker` (+ `image_cropper` if needed), `file_picker`, `share_plus`,
`receive_sharing_intent` (note: iOS share extension is a separate Xcode target
— budget a half-day of native iOS plumbing). Attachment uploads via
`firebase_storage`, honoring existing `storage.rules`.

### Design system — `omniflex_design_system` local package

Path-dependency at `mobile/packages/omniflex_design_system/`. If a canonical
OmniFlex Flutter design system exists at `C:/OmniFlex Vault/`, fork it as the
starting point. Tokens to expose: `OmniFlexColors`, `OmniFlexTypography`,
`OmniFlexSpacing` (8pt grid), `OmniFlexEffects` (neon glow `BoxShadow`, glass
blur via `BackdropFilter`), `OmniFlexRadii`. Provide an `OmniFlexTheme`
`ThemeData` factory and the `PulsingGlowLoader` widget the checklist names.

Brand source of truth: the OmniTask palette lives in `AGENTS.md`/`GEMINI.md`
(Primary Purple `#8b5cf6`, Secondary Blue `#3b82f6`, Accent Cyan `#06b6d4`,
backgrounds `#0f0f0f`–`#1a1a1a`, glass surface `rgba(255,255,255,0.05)`).
`tailwind.config.js` only carries a `violet` ramp today; manual sync at v1 is
fine, with a future `tools/sync_brand.dart` to generate tokens from Tailwind
once the palette is fully expressed there.

---

## Phased Roadmap

Effort is relative; "S" days, "M" 1–2 weeks, "L" multi-week.

- **Phase 0 — Scaffolding (S)**: `mobile/` directory, `flutter create`, design
  system skeleton, Firebase init both platforms, `mobile-ci.yml`, hello-world
  green on both platforms.
- **Phase 1 — Auth + read-only feed (M)**: Google Sign-In multi-scope,
  dashboard + my-tasks read-only, design system applied. Validates end-to-end
  Firestore path.
- **Phase 2 — Task CRUD (M)**: tasks/projects/schedule writes, offline tested,
  AI callables wired. Highest-risk phase for `firestore.rules` edge cases.
- **— Thin v1 ships here to TestFlight + Play Internal Testing —**
- **Phase 3 — Push (M)**: `sendTaskAssignmentPush` + `fcmTokens` rules, mobile
  registration, deep-link routing.
- **Phase 4 — Native features (M)**: camera attachments, share-to-app, file
  picker, Storage uploads.
- **Phase 5 — Hardening + store submission (L)**: App Store Connect + Play
  Console, Crashlytics, App Check enforcement, accessibility/perf passes per
  checklist sections 4–5, beta channels.

---

## Critical Gotchas

- iOS APNS Auth Key required (Apple Developer Program $99/yr) — without it
  `firebase_messaging` silently fails on iOS.
- Android SHA fingerprints: debug + Play upload + Play app-signing — easy to
  forget the third.
- Vertex AI region must match Cloud Functions region for AI callables.
- CI matrix: macOS runner needed for iOS — paid GitHub minutes, or a
  self-hosted Mac mini.
- App Check debug bypass code must never be committed (checklist §8).
- Background isolates for FCM don't carry Riverpod providers — re-init
  Firebase inside the handler.
- `receive_sharing_intent` on iOS is a separate Xcode target, not a Flutter
  package alone.
- `.firebaserc` declares only `default: omnitask-475422` — if a `dev` Firebase
  project is added for mobile testing, register it here.

---

## Files for v0 Scaffolding

**New (mobile)** under `/home/user/OmniTask/mobile/`:

- `pubspec.yaml`, `analysis_options.yaml` (extends `flutter_lints`, plus
  no-`print`/`debugPrint` rules from checklist §8)
- `lib/main.dart`, `lib/app.dart`
- `lib/core/router/app_router.dart`
- `lib/core/auth/auth_providers.dart`
- `lib/core/firestore/firestore_providers.dart`
- `lib/core/messaging/fcm_service.dart` (stub, wired in Phase 3)
- `lib/features/dashboard/presentation/dashboard_screen.dart` (placeholder)
- `lib/features/my_tasks/presentation/my_tasks_screen.dart` (placeholder)
- `packages/omniflex_design_system/{pubspec.yaml,
  lib/omniflex_design_system.dart,
  lib/src/{colors,typography,spacing,effects,theme}.dart}`
- `android/app/google-services.json` (gitignored; documented in README)
- `ios/Runner/GoogleService-Info.plist` (gitignored; documented in README)
- `.gitignore`, `README.md` (build/run + fingerprint registration steps)

**New (repo-level)**:

- `.github/workflows/mobile-ci.yml` — path filter `mobile/**`; `flutter
  analyze` + `flutter test`; Android build every PR, iOS build only on
  `main`/`live` to conserve macOS minutes.

**Modify**:

- `/home/user/OmniTask/.gitignore` — add `mobile/.dart_tool/`, `mobile/build/`,
  `mobile/ios/Pods/`, `mobile/android/.gradle/`, the two Firebase config files.
- `/home/user/OmniTask/.dockerignore` — exclude `mobile/` from the Cloud Run
  build context (create the file if missing).
- `/home/user/OmniTask/AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — append a
  "Mobile (Flutter)" stack section so agents know the second stack exists.

**Deferred to Phase 3 (NOT in scaffolding PR)**:

- `/home/user/OmniTask/functions/src/index.ts` — add `sendTaskAssignmentPush`
  trigger + `pruneFcmTokens` helper.
- `/home/user/OmniTask/firestore.rules` — `users/{uid}/fcmTokens/{tokenId}`
  rule.

---

## Critical Files Referenced

- `/home/user/OmniTask/functions/src/index.ts`
- `/home/user/OmniTask/firestore.rules`
- `/home/user/OmniTask/.github/workflows/deploy-cloudrun.yml`
- `/home/user/OmniTask/.antigravity/skills/omniflex-code-review/checklist.md`
- `/home/user/OmniTask/tailwind.config.js`
- `/home/user/OmniTask/firebase.json`
- `/home/user/OmniTask/.firebaserc`
- `/home/user/OmniTask/src/app/core/auth/auth.service.ts`

---

## Verification (Phase 0 done = all of these pass)

- `cd mobile && flutter pub get && flutter analyze` clean.
- `cd mobile && flutter test` clean.
- `cd mobile && flutter build apk --debug` succeeds.
- `cd mobile && flutter build ios --debug --no-codesign` succeeds (or via
  CI on a macOS runner).
- App launches on Android emulator and iOS Simulator showing a
  themed-but-empty home screen with `OmniFlexColors`/`Typography` applied.
- Existing web flow still works: `ng build --configuration production`,
  `ng test --watch=false --browsers=ChromeHeadless`, and the Cloud Run
  GitHub Action runs to completion on a no-op push to `live` (test in a
  feature branch first; do not push to `live` to test).

Subsequent phases add their own verification (auth round-trip in Phase 1,
offline-toggle CRUD test in Phase 2, real APNS+FCM message delivered to a
TestFlight build in Phase 3, share-extension intent received in Phase 4,
review submission acceptance in Phase 5).
