# Rebuilding-Camelot Marketing Site – Implementation Plan

> **Goal:** Build a standalone Astro + Tailwind + pnpm marketing site in the `rebuilding-camelot` repository that explains the Satnam ecosystem (three-system architecture) and drives **discovery call conversions** as the **primary CTA**, while still providing secondary CTAs to the live Satnam.pub application.

---

## Phase 0 – Scope & Architecture Overview

**Objective:** Define the concrete plan for the `rebuilding-camelot` marketing site as a standalone Astro + Tailwind + pnpm project.

### Core Architectural Narrative

Frame the Satnam ecosystem as three interconnected systems:

1. **Satnam.pub – Registrar & Control Board**  
   Identity, authentication, permissioning, and lifecycle management for human and AI agents.
2. **Citadel Academy – Knowledge Management**  
   Learning, curriculum, training, and cohort knowledge.
3. **Dynastic / GatherTheCircle – Communication Management**  
   Messaging, collaboration, and coordination for families, cohorts, and agents.

The site must communicate:

- How these three systems interoperate.
- When the **public Satnam.pub platform** is sufficient vs. when a **custom/white-label deployment** is appropriate.
- That the **primary business action** is to **schedule a 30-minute discovery call**.

---

## Phase 1 – Repository Initialization & Tooling

**Objective:** Create the `rebuilding-camelot` repo, scaffold Astro + TypeScript, configure pnpm, and verify local dev.

**Success criteria:**

- `pnpm install`, `pnpm dev`, and `pnpm build` run successfully.

### Task 1.1 – Create repo & initialize Astro

**Estimated time:** 0.5–1 hour

1. Create a new Git repository named `rebuilding-camelot` (no linkage to `satnam-recovery`).
2. In a local terminal:

   ```bash
   pnpm create astro@latest rebuilding-camelot
   cd rebuilding-camelot
   pnpm install
   ```

   - Template: minimal/basics
   - TypeScript: enabled (strict mode preferred)

3. Verify dev server:

   ```bash
   pnpm dev
   ```

### Task 1.2 – Project hygiene

**Estimated time:** 0.5 hour

- Confirm `package.json` scripts:
  - `"dev": "astro dev"`
  - `"build": "astro build"`
  - `"preview": "astro preview"`
- Optional (later): add lint/format scripts.

---

## Phase 2 – Tailwind CSS & Satnam Brand System

**Objective:** Integrate Tailwind, define brand tokens (colors, typography), and ensure global styles.

**Success criteria:**

- Tailwind integrated with Astro.
- Brand colors and typography available via Tailwind utilities.

### Task 2.1 – Add Tailwind integration

**Estimated time:** 0.5 hour

From repo root:

```bash
pnpm astro add tailwind
```

This:

- Installs Tailwind + PostCSS deps.
- Creates `tailwind.config.cjs` and `postcss.config.cjs`.

### Task 2.2 – Configure Satnam brand tokens

**Estimated time:** 1–1.5 hours

Edit `tailwind.config.cjs` to add brand colors and fonts, e.g.:

```js
// tailwind.config.cjs (excerpt)
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}"],
  theme: {
    extend: {
      colors: {
        satnam: {
          primary: "#0f766e", // main accent
          accent: "#f97316", // secondary highlight
          dark: "#020617", // primary background
          muted: "#1e293b", // cards/sections
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

### Task 2.3 – Base layout and global styles

**Estimated time:** 1 hour

1. Create `src/layouts/BaseLayout.astro` with:
   - `<html lang="en">`, `<head>`, `<body class="bg-satnam-dark text-slate-100 font-sans">`.
   - `<slot />` for page content.
2. Ensure Tailwind base styles are imported via `src/styles/global.css` and configured in `astro.config.mjs`.

---

## Phase 3 – Page Architecture & Layout (Template Structure)

**Objective:** Recreate the overall structure of the reference site as Astro components, wired to the Satnam narrative and the “Perfect Storm” context.

**Success criteria:**

- Single-page site at `/` with sections:
  - Hero (primary CTA: discovery call)
  - Story/Overview (including the Great Disillusionment, Great Wealth Transfer, and Bitcoin Monetary Evolution)
  - Features/Benefits
  - Three-System / Sovereignty Tetrahedron Architecture
  - How It Works
  - Who This Is For
  - FAQ
  - Final CTA (discovery call)

### Task 3.1 – Define `index.astro`

**Estimated time:** 0.5 hour

Create `src/pages/index.astro`:

- Import `BaseLayout` and section components.
- Compose sections in a logical order.

### Task 3.2 – Section components

**Estimated time:** 2–3 hours

Create components in `src/components/`:

- `HeroSection.astro`
- `StorySection.astro`
- `FeaturesSection.astro`
- `ThreeSystemsSection.astro`
- `HowItWorksSection.astro`
- `WhoThisIsForSection.astro`
- `FAQSection.astro`
- `FinalCTASection.astro`

Each component:

- Uses Tailwind for layout (`max-w-5xl mx-auto px-4 py-16`, responsive grids).
- Initially contains placeholder text to be refined later.

### Task 3.3 – StorySection narrative: Perfect Storm & Ark metaphor

**Estimated time:** 1–1.5 hours

In `StorySection.astro`, ensure the narrative explicitly:

- Names and briefly explains the three converging forces from the Rebuilding Camelot article:
  - **The Great Disillusionment** – AI-driven collapse of digital trust and data integrity.
  - **The Great Wealth Transfer** – the ~$84T intergenerational transfer already underway.
  - **The Bitcoin Monetary Evolution** – Bitcoin as protection from inflation, confiscation, and third‑party risk (with Lightning as its transactional layer).
- Uses “build your Ark before the storm” language to frame urgency, tying these forces together as a **perfect storm** that families and organizations must prepare for now.

---

## Phase 4 – Sovereignty Tetrahedron Architecture Content & Visuals

**Objective:** Clearly communicate the Sovereignty Tetrahedron (Rebuilding Camelot + three-system architecture) in copy and layout.

**Success criteria:**

- Dedicated section explaining how Rebuilding Camelot’s invisible governance structures, Satnam.pub, Citadel Academy, and Dynastic.me/Dynastic Apps interoperate as a Sovereignty Tetrahedron.
- Copy explicitly references Bitcoin & Lightning (monetary bedrock), Nostr (identity and messaging), and eCash (private bearer-value payments) as foundational protocol rails that the ecosystem is built on.

### Task 4.1 – Architecture copy

**Estimated time:** 1–1.5 hours

In `ThreeSystemsSection.astro`, structure content as:

- Title: "Sovereignty Tetrahedron: Rebuilding Camelot + Three Interlocking Systems".
- Intro: short paragraph explaining:
  - Rebuilding Camelot as the **invisible governance apex** (trusts, PMAs, legal frameworks, operational agreements).
  - Satnam.pub, Citadel Academy, and Dynastic.me/Dynastic Apps as the three visible systems that sit beneath that apex.
- Four conceptual pillars (whether as cards or a card + callout):
  - **Rebuilding Camelot – Invisible Governance Structures (Apex)**
  - **Satnam.pub – Registrar & Control Board**
  - **Citadel Academy – Knowledge Management**
  - **Dynastic.me / Dynastic Apps – Communication & Mobile Command Interface**

### Task 4.2 – Architecture visual pattern

**Estimated time:** 1–1.5 hours

- Use a three-column grid on desktop (`md:grid-cols-3`) with cards for the three visible systems:
  - `bg-satnam-muted`, `border border-satnam-primary/40`, `rounded-2xl`, `shadow`.
- Optionally add a small visual that:
  - Depicts **Rebuilding Camelot** as an apex above the three cards (e.g., a top label or callout box).
  - Indicates that the entire structure rests on protocol rails: Bitcoin & Lightning, Nostr, and eCash.
- Optionally add a simple flow diagram below (flex layout):
  - Satnam.pub ↔ Citadel Academy ↔ Dynastic.me/Dynastic Apps with short captions.

---

## Phase 5 – Discovery Call CTA & App Interoperability Hooks

**Objective:** Implement the **primary discovery call CTA** and secondary Satnam.pub app CTAs, with clear configuration and scheduler integration.

**Success criteria:**

- Primary CTA across site: "Schedule a 30-Minute Discovery Call".
- Secondary CTA: "Launch Satnam.pub" / "Try the Platform".
- Discovery call scheduling integrated via configurable URL.
- Copy makes it clear the discovery call serves multiple audiences: families/family offices and organizations, qualified developers, and legal professionals interested in the Sovereignty Tetrahedron.

### Task 5.1 – Configure CTA URLs

**Estimated time:** 0.5 hour

Create `src/config/links.ts`:

- Export constants for:
  - `SATNAM_APP_URL` – main Satnam.pub app.
  - `DISCOVERY_CALL_URL` – external scheduler (e.g., Calendly).

Example:

```ts
// src/config/links.ts
export const SATNAM_APP_URL = "https://app.satnam.pub";
export const DISCOVERY_CALL_URL =
  "https://calendly.com/your-org/satnam-discovery";
```

(These can later be replaced with environment-driven values if needed.)

### Task 5.2 – Primary CTA implementation (buttons & hierarchy)

**Estimated time:** 1–1.5 hours

Update `HeroSection.astro` and `FinalCTASection.astro`:

- **Primary button**:
  - Label: "Schedule Your Discovery Call" or "Book a 30-Minute Consultation".
  - `href={DISCOVERY_CALL_URL}`.
  - Visually prominent (e.g., `bg-satnam-primary text-white px-6 py-3 rounded-full text-lg font-semibold shadow-lg`).
- **Secondary button**:
  - Label: "Launch Satnam.pub".
  - `href={SATNAM_APP_URL}`.
  - Lower visual weight (e.g., `border border-satnam-primary text-satnam-primary bg-transparent`).

Optional: in `BaseLayout.astro` header/nav, add a right-aligned primary CTA button linking to `DISCOVERY_CALL_URL` (could be sticky on scroll) to reinforce conversions.

### Task 5.3 – Scheduler integration (embed or external)

**Estimated time:** 1–2 hours

Decide between:

1. **Simple external link** (fastest):
   - Primary buttons open `DISCOVERY_CALL_URL` in a new tab.

2. **Embedded scheduler section** (recommended medium-term):
   - Create `src/components/DiscoverySchedulerSection.astro`.
   - Embed Calendly or similar inline widget (using their script/snippet) below the Final CTA or in a dedicated section.

Implementation tasks:

- Add a new section to `index.astro` (e.g., after "Who This Is For"):
  - Title: "Schedule Your 30-Minute Discovery Call".
  - Short copy explaining what happens on the call:
    - Needs assessment for families/family offices and organizations (custom/white-label vs public platform).
    - On-ramp for qualified developers and legal professionals to explore collaboration on the Sovereignty Tetrahedron.
  - Embedded scheduler or a large CTA button.

---

## Phase 6 – Netlify Configuration & Deployment

**Objective:** Configure Netlify build settings and deploy the site.

**Success criteria:**

- Netlify build uses pnpm and Astro successfully.
- Production URL is reachable.

### Task 6.1 – `netlify.toml` setup

**Estimated time:** 0.5 hour

Create `netlify.toml`:

```toml
[build]
  command = "pnpm build"
  publish = "dist"
```

### Task 6.2 – Netlify site configuration

**Estimated time:** 0.5–1 hour

- Connect `rebuilding-camelot` repo to Netlify.
- Set build command `pnpm build` and publish directory `dist` in UI (to match `netlify.toml`).
- Trigger an initial deploy and fix any build issues.

### Task 6.3 – Domain & redirects (optional)

**Estimated time:** 1 hour

- Attach custom domain (e.g., `www.satnam.pub` or `about.satnam.pub`).
- Add redirects later if needed (e.g., `/app` → main Satnam app).

---

## Phase 7 – Content Refinement, Audience Targeting & Discovery Call Messaging

**Objective:** Tailor content to target audiences and reinforce the discovery call as the primary CTA.

**Success criteria:**

- Clear messaging for families, businesses, and organizations.
- Discovery call positioned as a needs assessment consultation.

### Task 7.1 – "Who This Is For" section

**Estimated time:** 1–1.5 hours

In `WhoThisIsForSection.astro`:

- Title: "Who This Is For".
- Three primary categories:
  - **Families seeking sovereignty** – private family coordination, legacy planning, and communication.
  - **Businesses needing custom CRM/payment infrastructure** – Nostr/eCash integrated CRM and payments tailored to their workflows.
  - **Organizations requiring white-label ecosystems** – co-branded or fully white-label deployments of Satnam + Citadel + Dynastic/GTC.
- CTA text within or near this section:
  - "Not sure if you need custom infrastructure? Schedule a free 30-minute discovery call to explore your options."

### Task 7.2 – Discovery call positioning copy

**Estimated time:** 1 hour

Refine copy in `HeroSection.astro`, `DiscoverySchedulerSection.astro`, and `FinalCTASection.astro`:

- Near the primary CTA:
  - "Explore whether a custom Satnam deployment fits your family or business—or if our public platform is all you need."
  - "Use this call to map your sovereignty requirements and decide if the Satnam ecosystem is the right fit."

Clarify that the call covers:

- Whether a **custom white-label/packaged version** is appropriate.
- Whether the solution is best tuned for **families**, **businesses**, or **organizations**.
- Whether the **existing public Satnam.pub platform** is sufficient.

### Task 7.3 – Secondary Satnam.pub CTAs

**Estimated time:** 0.5–1 hour

Ensure secondary CTAs are present but visually secondary to the discovery call:

- In hero and final CTA sections:
  - Secondary button: "Launch Satnam.pub" or "Try the Platform".
- In explanatory sections:
  - Inline links guiding users to the public platform for self-service exploration.

### Task 7.4 – Motto & Ark metaphor integration

**Estimated time:** 1 hour

Refine copy in `HeroSection.astro`, `StorySection.astro`, and `FinalCTASection.astro` so that:

- The guiding principle **"Strong Families Can Rebuild Good Times"** appears as a prominent motto (e.g., in hero or story).
- The “build your Ark before the storm” metaphor is used to tie together:
  - The Great Disillusionment (digital trust collapse),
  - The Great Wealth Transfer,
  - The Bitcoin Monetary Evolution,
    as the converging forces that make Satnam’s sovereignty infrastructure urgent.

---

## Phase 8 – QA, Accessibility, Performance, and Documentation

**Objective:** Ensure site quality and maintainability.

**Success criteria:**

- Good Lighthouse scores.
- Basic accessibility and responsive behavior.
- Clear developer onboarding docs.

### Task 8.1 – QA & performance

**Estimated time:** 1–1.5 hours

- Run `pnpm build` locally and `pnpm preview` for a production-like check.
- Use Chrome Lighthouse to measure performance, accessibility, and SEO.
- Fix major issues (image sizes, contrast, heading structure).

### Task 8.2 – README & onboarding

**Estimated time:** 0.5–1 hour

Create `README.md` with:

- Stack summary (Astro, Tailwind, pnpm, Netlify).
- Setup commands:
  - `pnpm install`
  - `pnpm dev`
  - `pnpm build`
- Brief note on:
  - `SATNAM_APP_URL` and `DISCOVERY_CALL_URL` constants.
  - Netlify deployment pipeline configuration.

---

**End of Plan**
