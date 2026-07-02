# Configure Firebase SMTP Secrets

Runbook for [issue #91](https://github.com/OmniFlexFitness/OmniTask/issues/91).

The `firestore-send-email` extension is wired in `extensions/firestore-send-email.env`. Extension env files and Secret Manager IAM are already in the repo. The remaining step is injecting live credentials in Google Cloud.

## Prerequisites

- Access to `bertin.kenol@omniflexfitness.com` Google Workspace (App Password generation)
- Editor access to GCP project `omnitask-475422`

## Steps

1. Generate a Google App Password for the `omnitask@omniflexfitness.com` alias via a Workspace admin account (currently `bertin.kenol@omniflexfitness.com`).

2. Open [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=omnitask-475422).
3. Update `EXT_MAIL_SMTP_CONNECTION_URI` in Secret Manager (not the committed `.env` file) to the account that owns the App Password:
   ```
   smtps://bertin.kenol%40omniflexfitness.com@smtp.gmail.com:465
   ```
   Keep `DEFAULT_FROM` as `OmniTask <omnitask@omniflexfitness.com>` — the SMTP username is for authentication only.
4. Update `EXT_MAIL_SMTP_PASSWORD` with the 16-character App Password.
5. Deploy extensions:
   ```bash
   npx firebase-tools deploy --only extensions:firestore-send-email --project omnitask-475422
   ```
   Or trigger the GitHub Actions deploy workflow on `live`.

### CLI shortcut (after installing [Google Cloud SDK](https://cloud.google.com/sdk/docs/install))

From repo root, with `gcloud auth login` completed:

```powershell
.\scripts\inject-smtp-secrets.ps1 -AppPassword 'YOUR16CHARPASSWORD' -DeployExtension -UpdateNodemailerSecret
```

This updates `EXT_MAIL_SMTP_CONNECTION_URI`, `EXT_MAIL_SMTP_PASSWORD`, optionally `NODEMAILER_SMTP_PASSWORD`, and redeploys the extension.

## Verification

```powershell
cd functions
$env:GOOGLE_CLOUD_PROJECT = 'omnitask-475422'
node scripts/send-mail-test.js dijinvestments3@gmail.com
```

- Expect `delivery.state: SUCCESS` on the new `mail` document within ~15s.
- Or trigger a task assignment and check the `notifications` collection via `node check-mail.js`.
- Check Cloud Functions logs for `ext-firestore-send-email-processQueue` if send fails.

## Cloud Functions path (same App Password)

Task assignment and reminder emails use `NODEMAILER_SMTP_PASSWORD` in Cloud Functions (`functions/src/index.ts`), not the Firestore extension. After injecting secrets, also set runtime env `NODEMAILER_SMTP_USER=bertin.kenol@omniflexfitness.com` and redeploy functions if not already configured.

## Repo config reference

| Setting | Value |
|---------|-------|
| Extension env | `extensions/firestore-send-email.env` |
| From address | `OmniTask <omnitask@omniflexfitness.com>` |
| Mail collection | `mail` |
| Firebase project | `omnitask-475422` |
