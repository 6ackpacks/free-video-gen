# Browser interaction checks

Start the local app and install Python Playwright (`pip install playwright`, then `python -m playwright install chromium`). Run from the repository root:

```text
python scripts/e2e/interactions.py
python scripts/e2e/creative-materials.py
python scripts/e2e/library-and-works.py
python scripts/e2e/industry-actions.py
python scripts/e2e/footspa-references.py
python scripts/e2e/production-feedback.py
python scripts/e2e/generation-presets.py
python scripts/e2e/prompt-production.py
python scripts/e2e/project-library.py
python scripts/e2e/product-audit.py
python scripts/e2e/account-drawer.py
```

Set `E2E_BASE_URL` if the server uses a port other than 4192. The application must have the normal built-in catalogs and the video-route configurations used by these scenarios. No external generation service is invoked: project/material/template writes and video submissions are intercepted inside each browser context. Server domain and provider-request behavior is tested separately with `npm test`.

Evidence is written under ignored `data/` directories. The scenarios cover project creation, industry input, stable action selection, product/person/scene roles, file selection and upload, editable generation presets and image-based aspect ratio, submission recovery, specialty massage configuration, works management, navigation, and responsive layouts. They do not validate real provider output or Electron's native login window.

The footspa reference scenario checks local video decoding and HTTP range delivery, external-only and no-reference layouts, original Douyin links, optional identity inputs, prompt recipes, and stable selection. Import the reference media into ignored `data/footspa-references/` before running it; no provider generation is called.

Production feedback verifies no-submission, pending, failure and missing-output states. The restored account page uses mocked desktop IPC to check account/conversation selection and layout bounds; a real logged-in Electron account still requires manual verification.

Generation presets verifies direct submission without parameter/confirmation dialogs, automatic landscape ratio from the actual base image, explicit submission failure and retry with the same request ID. All submissions are intercepted.

Prompt production verifies empty drafts cannot submit, generated text appears progressively, production stays disabled while drafting, completed prompts enable production, and retained dirty prompts require explicit confirmation. Drafts and video submissions are simulated.

Project library checks historical and empty projects, search, association of generated and uploaded images, image inspection, project video status and actual output counts, explicit refresh, project-only versus all works, and responsive layouts. Only read requests and browser fixtures are used.

The independent product audit verifies editable video settings in place, TokenDance model changes, monitor-view reminders and confirmation, returning from image preparation to its source step, and local retry of failed image/video tasks. No real provider generation occurs.

Account drawer checks same-page opening, existing inputs and URL retention, inherited desktop account IPC, iframe-to-window coordinate bounds and close behavior. Prompt production also checks model changes during drafting and use of that choice in the submitted job.

The primary footspa monitor workspace now uses a single project work line. Run `python scripts/e2e/monitor-line.py` to verify multiple scene uploads, independent action frames, editable settings during background drafting, manual prompt retention, same-page submission, per-video retry and preservation of the player across polling. Provider calls and mutations are intercepted. The separate project works URL redirects into this workspace's results section; all-works remains available. Historical step-layout scenarios can use `legacyLayout=1` when verifying the retained compatibility view.
