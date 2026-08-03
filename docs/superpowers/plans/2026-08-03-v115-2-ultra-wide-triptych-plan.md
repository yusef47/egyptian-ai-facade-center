# V115.2 Ultra-Wide Triptych Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Request an ultra-wide 3:1 triptych and let users inspect the generated image at native resolution in a scrollable fullscreen lightbox.

**Architecture:** Keep generation unchanged as one `buildOpenRouterRequest` call and strengthen only the exported master prompt. Keep lightbox state local to `EngineSection`; render the inline image inside an overflow-x viewport and reuse the same output URL in the modal without introducing a dependency or transformation.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS v4, Vercel serverless API.

## Global Constraints

- Keep one API call, one generated image, and the existing `google/gemini-3.1-flash-lite-image` model.
- Preserve the API contract `{ imageDataUrl, prompt } -> { imageDataUrl }`.
- Include the exact requirement: `Generate the architectural triptych as an ULTRA-WIDE PANORAMIC image with a 3:1 width-to-height ratio (e.g. 3072×1024 or wider). Each of the 3 panels must occupy exactly one-third of the total width, so that EACH individual panel has the same level of detail, resolution, and visual quality as a standalone full-size architectural render. Do NOT compress or narrow the panels.`
- Do not add a package or alter payload trimming/network behavior.
- Keep existing triptych labels, report download, loading, errors, and bilingual behavior.

---

### Task 1: Add regression tests for the ultra-wide prompt and lightbox

**Files:**
- Modify: `tests/v115-openrouter.test.ts`
- Modify: `tests/studio.test.tsx`

**Interfaces:**
- Consumes: existing `MASTER_ARCHITECTURAL_SYSTEM_PROMPT`, `buildOpenRouterRequest`, and `EngineSection`.
- Produces: failing assertions that define the V115.2 prompt and inspection behavior.

- [ ] **Step 1: Add the prompt regression assertions**

Add a test to `tests/v115-openrouter.test.ts` that reads the system instruction from `buildOpenRouterRequest` and asserts `/ULTRA-WIDE PANORAMIC/i`, `/3:1/`, `/3072×1024|3072x1024/i`, `/exactly one-third/i`, `/same level of detail/i`, and `/Do NOT compress or narrow/i`.

- [ ] **Step 2: Add lightbox behavior assertions**

Add a test to `tests/studio.test.tsx` that completes a mocked restoration, clicks the generated image trigger, asserts `role="dialog"`, asserts the dialog contains an image with the generated output URL, then presses Escape and asserts the dialog is removed.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run tests/v115-openrouter.test.ts tests/studio.test.tsx
```

Expected: existing tests pass but the new ultra-wide prompt and lightbox assertions fail because production code has not changed.

---

### Task 2: Implement the ultra-wide prompt and native-resolution lightbox

**Files:**
- Modify: `api/restore.ts:16-75`
- Modify: `client/src/components/EngineSection.tsx:1-300`
- Modify: `client/src/lib/i18n.tsx` only if new accessible UI labels require translations.

**Interfaces:**
- Consumes: existing result URL, `t`, and triptych/report UI.
- Produces: stronger `MASTER_ARCHITECTURAL_SYSTEM_PROMPT`; an inline native-size output viewport; local lightbox state and handlers.

- [ ] **Step 1: Add the exact ultra-wide generation requirement**

Insert the required paragraph into the mandatory triptych prompt immediately before the panel definitions. Keep one image and all existing panel identity constraints.

- [ ] **Step 2: Add local lightbox state and keyboard behavior**

Add `const [lightboxOpen, setLightboxOpen] = useState(false);`. Add an effect that, while open, listens for `keydown` Escape and closes the lightbox. Do not add a dependency. The trigger must be a semantic button with an accessible label and must only exist when `result` exists.

- [ ] **Step 3: Replace the constrained inline image surface**

Render the output inside a full-width `overflow-x-auto` viewport. Use an inner width that is at least `min(100%, 1024px)` and an image class with `block h-auto w-auto max-w-none min-w-[1024px]` so CSS does not impose a fixed max-height or downscale the source for inspection. Keep the surrounding board responsive.

- [ ] **Step 4: Render the fullscreen dialog**

When open, render a fixed inset overlay with `role="dialog"`, `aria-modal="true"`, an accessible label, and an overflow-auto content region. Use the same output URL with `className="block h-auto w-auto max-w-none"`. Include a close button, close on backdrop click, and `onKeyDown` Escape fallback. Keep the image trigger and dialog labels bilingual via existing or newly added i18n keys.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/v115-openrouter.test.ts tests/studio.test.tsx
npm run typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

---

### Task 3: Full verification, review, and release

**Files:**
- Review all modified files and tests.

- [ ] **Step 1: Run complete verification**

```bash
npm run typecheck
npm test -- --run
npm run build
git diff --check
```

Expected: typecheck succeeds, all Vitest tests pass, Vite build succeeds, and diff check is empty.

- [ ] **Step 2: Review the diff**

Confirm there is exactly one request path, no new dependency, no fixed `max-h-[420px]` on the generated output, no `max-w-full` that would force CSS downscaling in the inspection surface, and the prompt includes all exact ultra-wide constraints.

- [ ] **Step 3: Commit and push**

```bash
git add api/restore.ts client/src/components/EngineSection.tsx client/src/lib/i18n.tsx tests/v115-openrouter.test.ts tests/studio.test.tsx docs/superpowers/specs/2026-08-03-v115-2-ultra-wide-triptych-design.md docs/superpowers/plans/2026-08-03-v115-2-ultra-wide-triptych-plan.md
git diff --cached --check
git commit -m "feat: improve triptych panoramic image quality"
git push origin HEAD:main
```

After pushing, verify `git status --short --branch` is clean and `git ls-remote origin refs/heads/main` matches the pushed commit.
