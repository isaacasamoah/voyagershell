# VoyagerShell Privacy Policy

**Last updated:** 28 February 2026
**Entity:** VoyagerShell (operated by Isaac Asamoah, Australia)
**Contact:** isaac@voyagershell.ai

---

## The short version

VoyagerShell learns you to serve you. Your data exists to make your experience smarter — not to train models, not to sell to advertisers, not to build profiles for third parties. When you delete something, it's deleted.

---

## What we collect

### Account information
- **Email address** — used for login (magic link authentication) and account identification
- **Display name** — derived from your email or set by you

### Your conversations and knowledge
- **Messages you send and receive** — stored exactly as written, never summarised or lossy-compressed
- **Knowledge that Voyager learns** — topics, entities, patterns, and preferences extracted from your conversations
- **Learning signals** — when you correct Voyager or re-explain something, we note it to improve your experience (not to train external models)

### Voyage (team) data
- **Membership and roles** — which voyages you belong to and your role (captain, navigator, crew, observer)
- **Shared knowledge** — anything you say in a voyage is visible to other members of that voyage

### Technical data
- **Usage metrics** — token counts, response latency, and model costs (for our own billing and performance monitoring)
- **Retrieval events** — what Voyager searched for and what it found useful (used to improve retrieval quality for you)

### What we don't collect
- No cookies (beyond a session token for authentication)
- No analytics or tracking pixels
- No device fingerprinting
- No cross-site tracking
- No location data

---

## How your data is processed

VoyagerShell uses AI and cloud infrastructure to operate. Your data is sent to the following providers:

| Provider | What they receive | When | Why |
|----------|------------------|------|-----|
| **Supabase** | All account data, messages, knowledge, voyage membership | Always | Database hosting, authentication, real-time updates |
| **Anthropic (Claude)** | Your messages and conversation context | Every chat turn | Generating responses, reasoning, tool use |
| **OpenAI** | Message content | Background processing | Generating search embeddings (vectors only, not stored by OpenAI) |
| **Google (Gemini)** | Message content | Background processing | Extracting topics, entities, and titles |
| **Resend** | Your email address | Login only | Sending magic link emails |
| **Tavily** | Search query text | When you ask Voyager to search the web | Web search results |

**Important:** All three AI providers (Anthropic, OpenAI, Google) process data under API terms that prohibit using your data to train their models. Your conversations are not training data.

---

## Where your data lives

- **Database:** Supabase (PostgreSQL), hosted in cloud infrastructure with encryption at rest
- **Application:** Hosted on Vercel (serverless)
- **Backups:** Managed by Supabase's automated backup system

Data is encrypted in transit (HTTPS/TLS) for all connections.

---

## Who can see your data

- **Your personal knowledge** — only you. Row-level security enforces this at the database level.
- **Voyage knowledge** — visible to members of that voyage. You choose which voyages to join.
- **VoyagerShell operators** — we can access data for debugging and support, but don't routinely review user content.
- **No one else.** We don't sell, rent, or share your data with third parties for their own purposes.

---

## Your rights

You can:
- **Access your data** — everything Voyager knows about you is visible in the interface
- **Correct your data** — correct or update any knowledge Voyager has learned
- **Delete your data** — request deletion of your account and all associated data
- **Export your data** — request a copy of your data in a portable format
- **Leave a voyage** — remove yourself from any shared space at any time

To exercise these rights, email isaac@voyagershell.ai.

---

## Data retention

- **Knowledge events** are retained for the life of your account. Items you "quiet" are hidden from active retrieval but preserved in the event log.
- **When you delete your account**, all personal knowledge, messages, learning signals, and retrieval events are permanently deleted. Shared voyage contributions may be retained in anonymised form.

---

## Children

VoyagerShell is not intended for anyone under 16. We don't knowingly collect data from children.

---

## Australian Privacy Principles

VoyagerShell complies with the Australian Privacy Principles (APPs) under the Privacy Act 1988 (Cth). If you believe we've breached the APPs, contact us first — if we can't resolve it, you can lodge a complaint with the [Office of the Australian Information Commissioner (OAIC)](https://www.oaic.gov.au/).

---

## International data transfers

Your data may be processed in jurisdictions outside Australia by our service providers (Anthropic — USA, OpenAI — USA, Google — USA, Supabase — varies by project region). These transfers are necessary to provide the service and are covered by each provider's data processing agreements.

---

## Changes to this policy

We'll update this policy as VoyagerShell evolves. Material changes will be communicated through the app. The "last updated" date at the top tells you when it was last revised.

---

## Questions?

Email isaac@voyagershell.ai. Genuine question, not a form letter — I read every one.
