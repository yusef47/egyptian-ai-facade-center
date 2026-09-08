# Qattan AI style decisions

## Product identity

- Product name: **Qattan AI / قطان AI**.
- Tagline: **Next-Gen AI Architectural & Interior Visualization Studio**.
- The product uses original Qattan copy, CSS architectural illustrations, and generated/local assets. It does not copy proprietary source code, logos, or protected visual files from reference products.

## Marketing language and layout

- White editorial marketing surface with compact navigation, cobalt primary actions, near-black typography, neutral borders, and restrained rounded cards.
- Public information architecture: hero, before/after comparison, workflow steps, tool showcase, compatibility strip, access/pricing preview, FAQ, and footer disclaimer.
- The hero and comparison visuals are CSS-based architectural studies so the site has a polished presentation without relying on unverified placeholder imagery.
- Pricing and account language is explicitly preview-only; there is no checkout or fabricated credit balance.

## Studio language and layout

- The studio uses a deep obsidian workspace with Cairo/gold accents to keep the existing architectural engines readable and presentation-oriented.
- Desktop layout: control rail, live viewport, and session/history rail. Mobile layout: stacked controls, viewport, and history.
- Facade Restoration and Floor Plan to CAD are the only live modes. Other cards are visibly marked planned and do not invoke the API.
- Generated outputs are labeled conceptual studies and remain subject to licensed architectural and engineering review.

## Typography and direction

- English uses system/Mona Sans fallbacks for UI and a restrained editorial scale.
- Arabic uses Cairo and IBM Plex Sans Arabic fallbacks.
- `/ar` and the default route use RTL; `/en` uses LTR. Locale changes update the document language and direction.

## Color tokens

- Qattan cobalt: `#003BCF`.
- Qattan cobalt dark: `#002DA5`.
- Ink: `#171717`.
- Muted text: `#737373`.
- Soft surface: `#F7F7F7`.
- Studio obsidian: `#0A0F1D`.
- Cairo gold for preserved architectural-engine controls: `#C5A059`.

## Engineering constraints

- Keep the OpenRouter key server-side in `OPENROUTER_API_KEY`.
- Preserve the `{ imageDataUrl, prompt, mode? } → { imageDataUrl }` API contract.
- Preserve one-call facade triptych and one-call CAD four-view generation costs.
- Keep DXF cropping, Potrace processing, ZIP generation, report export, and lightbox behavior client-side after the generated image is cached.
- Do not describe planned modes as separate working model pipelines.
