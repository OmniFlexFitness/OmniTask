<div align="center">

# OmniFlex Fitness

**Engineering the future of performance, coaching, and commerce.**

[omniflexfitness.com](https://omniflexfitness.com) &nbsp;·&nbsp; [flux.omniflexfitness.com](https://flux.omniflexfitness.com)

</div>

---

## About the Organization

OmniFlex Fitness is a vertically integrated fitness brand that designs and operates every layer of its own stack &mdash; from the storefront our customers shop on, to the internal tools our coaches and operators use, to the AI systems that power our content and programming.

We build AI-native, cloud-first software on **Google Cloud**, **Firebase**, and **Cloud Run**, with CI/CD orchestrated through **GitHub Actions**. Every product in the portfolio is deployed as a containerized service behind its own subdomain on `omniflexfitness.com`, with secrets managed in **Google Cloud Secret Manager** and data governed through **Firestore Security Rules**.

---

## Featured Repositories

### [OmniTask](https://github.com/OmniFlexFitness/OmniTask)

**Internal project & task management platform.**

OmniTask is the operational hub for the company &mdash; an Angular 21 application on Firebase that ties together task workflows, project dashboards, and integrations with Google Workspace (Contacts, Drive, Sheets). It is designed to be driven by humans *and* by agents.

- **Stack:** Angular 21 · TypeScript · Tailwind · Firebase (Auth, Firestore, Functions, Hosting) · Cloud Run · Nginx
- **AI-native:** Ships with a 10-server MCP configuration (`firebase`, `google-cloud`, `bigquery`, `cloud-sql`, `alloydb`, `spanner`, `google-drive`, `google-maps`, `angular-cli`, `github`) so any MCP-aware editor can talk to our infrastructure in natural language.
- **Firebase Extensions:** `firestore-multimodal-genai`, `firestore-vector-search` (Vertex AI embeddings), `storage-resize-images`, `speech-to-text`, `extract-image-text`, `firestore-send-email`, and `delete-user-data` for GDPR-aligned account deletion.
- **Dev loop:** Every pull request auto-deploys to an ephemeral Firebase Hosting preview channel (7-day TTL) with the URL posted back to the PR.

### [OmniFlux Studio](https://github.com/OmniFlexFitness/OmniFlux-Studio) &mdash; *OmniFlex Social AI*

**Neural content generator for cross-platform brand presence.** &nbsp; [Live &rarr;](https://flux.omniflexfitness.com)

OmniFlux Studio is the creative engine behind our social, email, and on-site copy. It uses Google's Gemini models to produce channel-tailored content from a single brief, with presets that encode our brand voice.

- **Stack:** React · Vite · Tailwind v4 · Firebase Auth (Anonymous) · Firestore
- **AI:** Gemini (`gemini-1.5-pro`) via Google AI Studio, with the API key injected at runtime from Secret Manager &mdash; never baked into the image.
- **Delivery:** Multi-stage Docker build (Node &rarr; Nginx) pushed to Artifact Registry and served from Cloud Run in `us-east1`. Versioning is semantic (`MAJOR.MINOR.BUILD`) with `BUILD` auto-incrementing per deploy.
- **Release flow:** Merges to `live` trigger the GitHub Actions deploy workflow; no manual `gcloud` required.

### [OmniFlex Shopify Theme](https://github.com/OmniFlexFitness/OmniFlex-Shopify-Theme)

**The customer-facing storefront.**

Our Shopify storefront theme, built on top of Shopify's Dawn 12.0 reference theme and extended with OmniFlex-specific sections, blocks, and styling. It is the first touchpoint most customers have with the brand.

- **Stack:** Liquid · Shopify CLI 2.0 theme architecture (`sections/`, `blocks/`, `snippets/`, `templates/`, `layout/`, `config/`)
- **Features:** Fully responsive, infinite-looping slideshow, configurable announcement bar, lazy-loaded media, reduced-motion support, and merchandiser-friendly drag-and-drop sections.
- **Localization:** Multi-locale support via the `locales/` directory.

---

## Architecture at a Glance

```
                         ┌─────────────────────────────┐
                         │       omniflexfitness.com   │
                         └──────────────┬──────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
   ┌───────────────┐           ┌───────────────┐            ┌───────────────┐
   │   Shopify     │           │   OmniTask    │            │  Flux Studio  │
   │   Storefront  │           │   (internal)  │            │  (AI content) │
   │               │           │               │            │               │
   │ Liquid / Dawn │           │ Angular 21    │            │ React + Vite  │
   │ Shopify CDN   │           │ Firebase      │            │ Cloud Run     │
   └───────────────┘           │ + Cloud Run   │            │ + Gemini API  │
                               └───────┬───────┘            └───────┬───────┘
                                       │                            │
                                       └──────────┬─────────────────┘
                                                  ▼
                              ┌────────────────────────────────────┐
                              │   Google Cloud  /  Firebase        │
                              │   Artifact Registry · Secret Mgr   │
                              │   Firestore · Vertex AI · BigQuery │
                              └────────────────────────────────────┘
```

---

## For Customers and the Public

- **Shop the brand:** [omniflexfitness.com](https://omniflexfitness.com) &mdash; powered by the [Shopify theme repo](https://github.com/OmniFlexFitness/OmniFlex-Shopify-Theme).
- **See our AI in action:** [flux.omniflexfitness.com](https://flux.omniflexfitness.com) &mdash; the public face of [OmniFlux Studio](https://github.com/OmniFlexFitness/OmniFlux-Studio).
- **Privacy & data rights:** OmniTask enforces GDPR-aligned deletion via the Firebase `delete-user-data` extension. Requests to remove account data are honored automatically on account closure.
- **Security:** Runtime credentials are never committed. API keys and Firebase configuration are sourced from Google Cloud Secret Manager and GitHub Encrypted Secrets and injected at container start.

## For Team Members and Contributors

### Conventions

- **Default integration branch is `live`** for OmniTask and OmniFlux Studio (`main` for the Shopify theme). Push to `live` = production deploy. Treat it accordingly.
- **Branch names:** `feature/*`, `fix/*`, `docs/*`, `chore/*`, `ui/*`. Agent-authored branches are prefixed with the agent name (`claude/*`, `codex/*`, `copilot/*`).
- **Commits follow Conventional Commits:** `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`, `test:`.
- **PRs are required** &mdash; every merge to `live`/`main` goes through review, CI, and (for OmniTask) an auto-deployed preview channel.

### Tooling

- **Node / TypeScript** across the web apps. Angular CLI for OmniTask, Vite for Flux Studio, Shopify CLI for the theme.
- **Testing:** Jest + Vitest for OmniTask, Vitest for Flux Studio. Coverage is tracked per-PR.
- **Containers:** Multi-stage Dockerfiles; runtime is always Nginx serving the built static bundle with environment injection via `env.sh` into `window.__ENV__`.
- **Secrets:** Google Cloud Secret Manager for runtime secrets, GitHub Encrypted Secrets for build-time config. Never commit `.env*` files &mdash; `.env.example` is the canonical reference.

### AI & Agent Development

OmniFlex embraces agent-assisted engineering. Our repos ship with:

- `GEMINI.md` / `gemini.md` &mdash; Gemini/Antigravity agent guidance.
- `.vscode/mcp.json` &mdash; MCP server configuration for Cloud SQL, BigQuery, Spanner, AlloyDB, Firebase, Google Drive, Maps, and GitHub.
- `.agent/` &mdash; shared prompts and workflows for the org's agents.
- Branch prefixes (`claude/`, `codex/`, `copilot/`) so agent-authored work is easy to identify in review.

### Getting Set Up

1. Request access to the `OmniFlexFitness` GitHub org and the `gen-lang-client-0572385664` Google Cloud project.
2. Install: Node 20+, the Firebase CLI, the Shopify CLI, and `gcloud`.
3. Clone the repo you're contributing to and copy `.env.example` to `.env.local`; populate from the team's password manager.
4. Run the local dev server (`ng serve`, `npm run dev`, or `shopify theme dev`) &mdash; each repo's `README.md` has the exact command.

---

## Contact

- **Engineering issues:** open an issue on the relevant repository.
- **Security disclosures:** please do **not** open a public issue. Email the security contact listed in the organization profile.
- **Everything else:** [omniflexfitness.com](https://omniflexfitness.com).
