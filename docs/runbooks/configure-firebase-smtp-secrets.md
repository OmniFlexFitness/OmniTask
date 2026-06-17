# Configure Firebase SMTP Secrets

Runbook for [issue #91](https://github.com/OmniFlexFitness/OmniTask/issues/91).

The `firestore-send-email` extension is wired in `extensions/firestore-send-email.env`. Extension env files and Secret Manager IAM are already in the repo. The remaining step is injecting live credentials in Google Cloud.

## Prerequisites

- Access to `bertin.kenol@omniflexfitness.com` Google Workspace (App Password generation)
- Editor access to GCP project `omnitask-475422`

## Steps

1. Generate a Google App Password for the `omnitask@omniflexfitness.com` alias via a Workspace admin account (currently `bertin.kenol@omniflexfitness.com`).

2. **Automated (recommended)** — requires `gcloud auth login`:

   ```powershell
   .\scripts\inject-smtp-secrets.ps1
   # optional: also update NODEMAILER_SMTP_PASSWORD for Cloud Functions nodemailer
   .\scripts\inject-smtp-secrets.ps1 -IncludeNodemailer
   ```

3. **Manual alternative** — [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=omnitask-475422):

   - Update `EXT_MAIL_SMTP_CONNECTION_URI` (not the committed `.env` file) to the account that owns the App Password:
     ```
     smtps://bertin.kenol%40omniflexfitness.com@smtp.gmail.com:465
     ```
     Keep `DEFAULT_FROM` as `OmniTask <omnitask@omniflexfitness.com>` — the SMTP username is for authentication only.
   - Update `EXT_MAIL_SMTP_PASSWORD` with the 16-character App Password.

4. Deploy extensions:
   ```bash
   npx firebase-tools deploy --only extensions
   ```
   Or trigger the GitHub Actions deploy workflow on `live`.

## Verification

- Add a document to the `mail` collection (or trigger a notification flow) and confirm delivery.
- Check Cloud Functions logs for the `firestore-send-email` extension if send fails.

## Repo config reference

| Setting | Value |
|---------|-------|
| Extension env | `extensions/firestore-send-email.env` |
| From address | `OmniTask <omnitask@omniflexfitness.com>` |
| Mail collection | `mail` |
| Firebase project | `omnitask-475422` |
