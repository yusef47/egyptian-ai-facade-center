# V115.3 Presentation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the official Egyptian branding and hero presentation committee-ready while preserving V115.2 functionality.

**Architecture:** Keep the existing Navbar, HeroSection, and global CSS boundaries. Add only presentation hooks and CSS in those files, with focused regression tests in the existing branding/navbar test files. Do not alter API, report, i18n behavior, or EngineSection functionality except for static regression confirmation.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve the exact public assets: `/logos/syndicate-logo.png`, `/logos/center-logo.png`, `/logos/egypt-flag.png`.
- Preserve the existing EN/عربي language toggle and `html.lang`/`html.dir` behavior.
- Preserve one-call triptych output, native-resolution horizontal scroll, fullscreen lightbox, and syndicate report download.
- Use Cairo Gold `#C5A059` for presentation accents and approximately 5–8% opacity for the decorative flag watermark.
- Do not add dependencies or unrelated sections.

---

### Task 1: Add failing V115.3 branding regression tests

**Files:**
- Modify: `tests/v115-branding.test.tsx`
- Modify: `tests/navbar.test.tsx`

**Interfaces:**
- Tests consume `Navbar` and `HeroSection` through `I18nProvider`.
- Tests produce stable DOM/class/accessibility requirements for the implementation tasks.

- [ ] **Step 1: Extend the hero test for presentation order and watermark accessibility**

Add assertions that:

```tsx
const hero = screen.getByTestId("hero-section");
const heading = hero.querySelector("h1");
const branding = screen.getByTestId("hero-branding");
expect(branding.compareDocumentPosition(heading as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(screen.getByTestId("hero-flag-watermark")).toHaveAttribute("aria-hidden", "true");
expect(screen.getByTestId("hero-flag-watermark")).toHaveAttribute("alt", "");
expect(branding).toHaveClass("hero-branding");
expect(branding.querySelector(".hero-logo-divider")).toBeTruthy();
```

Add an assertion that the hero title uses `font-cairo`.

- [ ] **Step 2: Extend the navbar test for gold-presentation hooks**

Assert the official cluster exists and each logo uses the existing navbar classes, while the flag remains between the two logo elements in DOM order. Keep the current EN/عربي behavior test unchanged.

- [ ] **Step 3: Run the focused tests and confirm expected failures**

Run:

```bash
cd /home/yusefelshater979/.worktrees/v115
npm test -- --run tests/v115-branding.test.tsx tests/navbar.test.tsx
```

Expected: existing tests pass; new assertions fail because the hero has no `hero-section` test hook, watermark, or above-heading order yet.

---

### Task 2: Implement the official presentation polish

**Files:**
- Modify: `client/src/components/HeroSection.tsx`
- Modify: `client/src/components/Navbar.tsx`
- Modify: `client/src/index.css`
- Modify: `client/src/pages/Home.tsx`

**Interfaces:**
- Keep all existing component props, translation keys, image paths, and interactive links unchanged.
- Produce `data-testid="hero-section"` and `data-testid="hero-flag-watermark"` hooks for regression tests.

- [ ] **Step 1: Add the hero watermark and reorder the lockup**

Make the section structure follow this order:

```tsx
<section data-testid="hero-section" className="hero-section relative overflow-hidden pt-32 pb-16">
  <div className="absolute inset-0 bg-gradient-to-b from-navy-lighter/30 to-background" />
  <img
    data-testid="hero-flag-watermark"
    src="/logos/egypt-flag.png"
    alt=""
    aria-hidden="true"
    className="hero-flag-watermark absolute inset-0 h-full w-full object-cover opacity-[0.06] grayscale mix-blend-screen"
  />
  <div className="container relative z-10">
    <div data-testid="hero-branding" className="hero-branding ...">
      ...existing small flag + two large logos + divider...
    </div>
    <h1 className="hero-title font-cairo ...">{t("hero.title")}</h1>
    ...existing hero content...
  </div>
</section>
```

Use the existing translation values and keep the small badge because the approved choice is to retain both the badge and watermark.

- [ ] **Step 2: Refine navbar presentation hooks and sizing**

Keep both logos at `h-12` and the flag at `h-7`; add an official cluster hook/class if needed, without changing navigation semantics or language controls.

- [ ] **Step 3: Update CSS for Cairo Gold polish and responsive lockups**

Use explicit presentation CSS equivalent to:

```css
.hero-section {
  isolation: isolate;
}
.hero-flag-watermark {
  opacity: 0.06;
  filter: grayscale(1) saturate(0.65) contrast(0.9);
  pointer-events: none;
  user-select: none;
}
.navbar-syndicate-logo:hover,
.navbar-syndicate-logo:focus-visible,
.navbar-center-logo:hover,
.navbar-center-logo:focus-visible {
  border-color: #c5a059;
  box-shadow: 0 0 0 2px rgba(197, 160, 89, 0.2), 0 0 20px rgba(197, 160, 89, 0.42);
}
.hero-title {
  font-family: var(--font-cairo);
  text-wrap: balance;
}
```

Preserve existing reduced-motion rules and ensure mobile classes allow the logos to shrink/wrap rather than overflow. Wire the existing `HeroSection` into `client/src/pages/Home.tsx` so the polished hero is present in the live route.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npm test -- --run tests/v115-branding.test.tsx tests/navbar.test.tsx
npm run typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

---

### Task 3: Full release verification and review

**Files:**
- Inspect all changed files and the V115.3 docs.

- [ ] **Step 1: Run the full release checks**

```bash
npm run typecheck
npm test -- --run
npm run build
git diff --check
```

Expected: typecheck/build/diff check exit 0 and all tests pass. The known jsdom canvas warning may appear during upload tests but must not be an assertion failure.

- [ ] **Step 2: Run static requirement audits**

```bash
find client/public/logos -maxdepth 1 -type f -name '*.png' -print
rg -n 'hero-flag-watermark|font-cairo|C5A059|navbar-syndicate-logo|navbar-center-logo|overflow-x-auto|role="dialog"|Download Official Syndicate Report' client/src tests
rg -n 'max-h-\[420px\]|<<<<<<<|=======|>>>>>>>' api client tests || true
```

Confirm the three assets, watermark, gold hooks, native triptych/lightbox, report, and no conflict markers or removed fixed output height.

- [ ] **Step 3: Dispatch code review and address Critical/Important findings**

Review the diff against the approved design. Fix any issue affecting accessibility, stacking, RTL/mobile presentation, or preservation of V115.2 functionality, then rerun the full release checks.

- [ ] **Step 4: Stage only scoped V115.3 files and verify the staged patch**

```bash
git add client/src/components/Navbar.tsx client/src/components/HeroSection.tsx client/src/index.css tests/navbar.test.tsx tests/v115-branding.test.tsx docs/superpowers/specs/2026-08-04-v115-3-presentation-polish-design.md docs/superpowers/plans/2026-08-04-v115-3-presentation-polish-plan.md
git diff --cached --check
```

- [ ] **Step 5: Commit and push normally**

```bash
git commit -m "feat: polish official branding presentation"
git push origin HEAD:main
```

Verify final status is clean and the remote `main` SHA equals the new commit SHA.
