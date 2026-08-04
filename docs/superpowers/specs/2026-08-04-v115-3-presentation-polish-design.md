# V115.3 Presentation Polish Design

## Goal

Prepare the Egyptian Center facade restoration site for an official committee presentation by refining branding placement, Cairo typography, and the hero's dignified Egyptian flag treatment without changing the approved V115.2 generation, lightbox, report, or bilingual behavior.

## Approved design

- Navbar remains RTL and preserves the existing official asset order: Egyptian Engineers Syndicate logo, Egyptian flag badge, Egyptian Center logo and title. Both logos remain approximately 48px high and receive a Cairo Gold (`#C5A059`) hover/focus glow.
- Hero branding moves above the main headline. It keeps the small Egyptian flag badge above two larger approximately 80px logos, separated by a thin Cairo Gold divider.
- Hero receives a separate Egyptian flag watermark behind its content at approximately 6% opacity. The watermark is decorative, grayscale/softened, and pointer-events-disabled so it cannot reduce readability or intercept controls.
- The Arabic institutional title remains exact and prominent, using the existing Cairo font token when Arabic is active and gold accents for institutional hierarchy.
- Existing EN/عربي switching, single-call triptych generation, native-size horizontal output scroll, fullscreen lightbox, and syndicate report download are unchanged.

## Accessibility and responsive behavior

- Decorative watermark uses an empty alt attribute and `aria-hidden="true"`.
- Official logos retain meaningful alt text.
- Existing keyboard language controls and lightbox behavior remain intact.
- Logo lockups use responsive sizing and wrapping; no fixed desktop-only width is introduced.
- Mobile navigation remains usable and the hero watermark remains behind content at all breakpoints.

## Verification

- Add focused tests for hero DOM order, watermark accessibility, visual class hooks, and official asset references.
- Preserve existing navbar bilingual tests and studio/report/lightbox tests.
- Run typecheck, full Vitest suite, production build, diff check, and static responsive/reference audits.
