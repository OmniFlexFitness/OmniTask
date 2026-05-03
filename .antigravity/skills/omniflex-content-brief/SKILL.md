---
name: omniflex-content-brief
description: Use when generating educational or marketing content for OmniFlex social media, blog, email, or app copy. Activates on prompts about creating content for Supplement Sundays, Max Out Mondays, OmniFacts, Based or BS, Fitness Frauds, quote posts, or generic OmniFlex educational posts. Applies the OmniFlex Voice (plain ASCII, study-guide formatting, science-forward, direct, anti-hype, myth-busting) and outputs in copy-block format ready for Obsidian and multi-platform distribution.
---

# OmniFlex Content Brief Generation

OmniFlex content has a specific voice and format. This skill encodes both so generated content is paste-ready for Obsidian, the Social Media Content Engine project, and direct platform distribution.

## Activation Triggers

Activate when a prompt mentions any of:
- Generating content for OmniFlex social media
- Specific content series: Supplement Sundays, Max Out Mondays, OmniFacts, Based or BS, Fitness Frauds, Quote Posts
- Writing captions, blog posts, email newsletters, push notifications, app onboarding copy
- Drafting educational content about supplements, training, nutrition, recovery, sports science
- Creating myth-buster content or rebuttals to fitness misinformation

## OmniFlex Voice — Hard Rules

### Confident
- Take a stance based on evidence
- Do not hedge unnecessarily ("studies suggest" → "studies show" when the evidence is strong)
- When evidence is genuinely mixed, say so explicitly: "the evidence is mixed" — do not pretend confidence

### Science-forward
- Cite sources where possible. Preferred: PubMed, NIH, peer-reviewed journals, ISSN, ACSM, NSCA position stands
- Distinguish correlation from causation explicitly when relevant
- Note study population (sex, training status, age) when generalizing
- Cite mechanism *and* outcome when both exist; mechanism alone is weak

### Direct
- Short sentences over long
- Active voice over passive
- Lead with the conclusion, then evidence
- Cut filler ("it's important to note that," "it's worth mentioning," "interestingly")

### Anti-hype
- Banned words: game-changing, revolutionary, cutting-edge, mind-blowing, insane, crazy, ultimate, secret, hack, unlock
- Never describe a supplement, exercise, or method as "the best" without comparative evidence
- Never imply a product is necessary; frame in terms of marginal benefit

### Myth-busting
- Frame educational content against the misconception when one exists
- Name the myth directly; do not be vague about what's wrong
- Show the evidence that contradicts it
- Acknowledge nuance where the myth has a kernel of truth

## Format Rules

### Plain ASCII

- No em dashes, fancy quotes, or special characters in copy meant for cross-platform distribution
- Use straight quotes ("), straight apostrophes ('), regular hyphens (-)
- This is a constraint inherited from cross-platform pasting (some platforms mangle Unicode)
- Exception: when the platform supports it and the user explicitly asks for typographic polish

### Study-guide structure for educational posts

```
HOOK (1-2 sentences)

CLAIM / TAKEAWAY (1 sentence, bolded if platform allows)

EVIDENCE (3-5 bullets)
- Bullet 1
- Bullet 2
- Bullet 3

NUANCE / WHO IT APPLIES TO (1-2 sentences)

CALL TO ACTION (1 sentence)
```

### Copy-block format for distribution

Every content output should be packaged as separate code blocks per platform. Example layout for a single educational post:

````markdown
## Caption — Instagram / Threads / Facebook

```
[Caption text here, with hashtags at end]
```

## Caption — Twitter/X (with thread breaks if needed)

```
1/ [First tweet, max 280 chars]

2/ [Second tweet]

3/ [Third tweet, ends with CTA]
```

## TikTok Hook (spoken, on-screen text)

```
HOOK (spoken): "[hook line]"
ON-SCREEN: "[text overlay]"
```

## Sources Cited

- [Author, Year. Title. Journal.](url)
- [Author, Year. Title. Journal.](url)
````

The user copies blocks platform-by-platform without re-formatting.

## Series-Specific Templates

See `templates/post-formats.md` for ready-to-fill templates for each content series.

## What NOT to Do

- Do not generate health claims that exceed the evidence (e.g., "Creatine prevents Alzheimer's" — the evidence is preliminary)
- Do not present mechanism-only evidence as outcome evidence
- Do not cite single studies when meta-analyses exist
- Do not generate content that could be construed as medical advice; reference medical consultation when symptoms are involved
- Do not write content in voices other than OmniFlex Voice without explicit instruction (no "casual influencer" tone, no "stiff academic" tone)
- Do not include affiliate links, brand partnerships, or product recommendations unless explicitly part of the brief

## Output Format

When generating an educational content brief:
1. Confirm the series and topic
2. Present the structure as code blocks per platform
3. Include sources at the end
4. Note any evidence gaps the user should be aware of before publishing
5. Suggest visual treatment (cyberpunk overlay, HUD-style data display) only if the user mentions visual production
