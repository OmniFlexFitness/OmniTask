# OmniTask

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Deploy Preview

This project is configured with automated deploy previews for pull requests. When you open or update a pull request, a GitHub Actions workflow will:

1. Build the Angular application
2. Deploy it to a Firebase Hosting preview channel
3. Post a comment on the PR with a link to the preview URL

The preview deployment allows you to test changes in a live environment before merging. Preview channels automatically expire after 7 days.

## AI Integrations (MCP & Extensions)

This project is fully integrated with a suite of AI-native tools to provide seamless agentic development and automated task processing features.

### 🔌 Model Context Protocol (MCP) Servers

OmniTask exposes its backend and APIs to AI editors (like VS Code Copilot, Cline, and Google DeepMind Antigravity) via an expansive `.vscode/mcp.json` configuration. These 10 servers grant AI tools secure, natural-language access to the infrastructure:

- **Core App & DB:** `angular-cli`, `firebase`, `google-cloud`
- **Context & Knowledge:** `github`, `google-drive`
- **Analytics & Relational DB:** `bigquery`, `cloud-sql`, `alloydb`, `spanner`
- **Location Services:** `google-maps`

*(Note: Verify MCP server activation in your IDE via the Command Palette: `MCP: List Servers`)*

### 🚀 Firebase Extensions

OmniTask leverages Firebase Extensions to outsource complex storage, media, and multi-modal AI processing:

- **`firestore-send-email`**: Sends automated SMTP alerts on task assignments.
- **`delete-user-data`**: Ensures GDPR compliance by purging `users/{uid}` data upon account deletion.
- **`storage-resize-images`**: Auto-optimizes uploaded avatar and cover images.
- **`googlecloud/speech-to-text`** & **`extract-image-text`**: Transcribes audio notes and whiteboards via Google AI APIs.
- **`firestore-multimodal-genai`**: Powers auto-tagging, task summaries, and generative chat features directly against the Firestore history.
- **`firestore-vector-search`**: Uses Vertex AI embeddings to provide semantic search functionality without needing third-party search engines like Algolia.

These extensions are defined in `firebase.json` and deploy automatically via the GitHub Actions `live` workflow. Their API keys and configuration secrets are managed securely via **Google Cloud Secret Manager**.

## Deployment & Architecture

For a detailed explanation of how this application is hosted and deployed using GitHub, Google Cloud, Firebase, and Cloudflare, please refer to the [Deployment & Architecture Guide](DEPLOYMENT.md).

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
