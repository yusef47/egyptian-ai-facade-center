# Blender Lab pilot

This is an isolated experiment at `/ar/architect/blender-lab`. The Architect Workspace at `/ar/architect` and `/architect` is also private while under development. Access is limited to the two named owner accounts in `lib/admin.ts`; additional dashboard admins from `ADMIN_EMAILS` do not gain pilot access. There are no public navigation links to these pages. Anonymous and other visitors receive 404 for the pages and their generation APIs; crawlers are disallowed and the pages use `noindex` metadata. Image generation and the public Studio are unaffected. The text model writes a complete `bpy` Python scene for each turn. A short-lived Vercel Sandbox installs Blender when needed, runs the script with outbound network denied, exports GLB, and stops. The browser displays and downloads the GLB and the editable Python source. The previous source is kept in this browser for the next turn; it is not a shared server project.

## Enable after a normal GitHub deploy

1. Keep `QATTAN_BLENDER_LAB_ENABLED=0` until ready to spend Sandbox and OpenRouter capacity. In Vercel project environment variables set `OPENROUTER_API_KEY`, `OPENROUTER_ARCHITECT_TEXT_MODEL`, and `QATTAN_BLENDER_LAB_ENABLED=1` for the intended environment.
2. Deploy the code using the project's normal GitHub → Vercel flow. No Vercel CLI deploy or custom image push is required for the first experiment. The SDK uses Vercel's project identity in a deployed Vercel Function.
3. Sign in with an admin account and open `/ar/architect/blender-lab`. Try a simple single-storey model before a multi-storey request. A first request can be slow because Blender is installed in a fresh Sandbox each time.
4. If the Vercel project has Fluid Compute disabled, enable it for the 300-second route duration, or reduce the route budget and use a prebuilt image. The route needs enough time for model generation, package installation and Blender execution.

Optional: `QATTAN_BLENDER_SANDBOX_IMAGE` can point to a project-accessible Vercel Sandbox image with Blender preinstalled. This speeds up requests but requires a separately prepared image; it is not needed for the pilot.

For local live Sandbox testing, the Vercel CLI must be authenticated and the project linked; `vercel env pull` supplies local OIDC credentials. Ordinary `npm run typecheck`, `npm test` and `npm run build` do not require Sandbox credentials.

## Limits and scope

- Every POST requires Supabase admin authorization and rate limiting. There is no public generation path. A feature flag keeps it inactive by default.
- Generated Python runs only in a disposable Vercel Sandbox. The app passes no OpenRouter or Supabase keys into the Sandbox, and disables outbound network before Python execution.
- Model output, script, runtime and GLB size are bounded. GLB is capped at 2 MB before base64 transport to fit a single response. Larger models need object storage and an asynchronous job design.
- The downloaded `.py` file can recreate/edit the scene in Blender. The pilot does not yet persist a native `.blend` file or export Revit/IFC/DWG.
- Geometry is an unverified concept. No Egyptian code compliance, structural analysis, or construction approval is implied.

The existing deterministic Architect Workspace remains independent. This lab is a separate path for checking whether model-authored Blender scenes are useful before connecting them to the project's structured geometry and validation pipeline.

## Review gate

The general chat now generates a draft, asks the text model for a separate full-script architectural/code review and correction, and checks the returned script for known deterministic geometry mistakes before Blender executes it. The checker catches the exact failures found in the live 20×20 m two-apartment test: halving dimensions when scaling a unit cube and literal door/window offsets beyond a wall's length. If the corrected script still has either error, the route rejects the result instead of displaying a broken GLB. A successful Blender export is still only a technical execution check; this review does not certify circulation, daylight, structure, local code, or design quality. Broader geometry validation needs a structured scene/room representation rather than unrestricted Python alone.

If Blender rejects the reviewed script, the route sends the actual execution error back to the model for one repair and reruns the corrected source in the same sandbox. It publishes the final source and GLB only after a successful export. This catches syntax/runtime mistakes such as the indentation error seen in the second live apartment test; it does not make the model a licensed architect or provide a visual quality guarantee.
