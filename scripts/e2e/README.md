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
```

Set `E2E_BASE_URL` if the server uses a port other than 4192. The application must have the normal built-in catalogs and the video-route configurations used by these scenarios. No external generation service is invoked: project/material/template writes and video submissions are intercepted inside each browser context. Server domain and provider-request behavior is tested separately with `npm test`.

Evidence is written under ignored `data/` directories. The scenarios cover project creation, industry input, stable action selection, product/person/scene roles, file selection and upload, editable generation presets and image-based aspect ratio, submission recovery, specialty massage configuration, works management, navigation, and responsive layouts. They do not validate real provider output or Electron's native login window.

The footspa reference scenario checks local video decoding and HTTP range delivery, external-only and no-reference layouts, original Douyin links, optional identity inputs, prompt recipes, and stable selection. Import the reference media into ignored `data/footspa-references/` before running it; no provider generation is called.

Production feedback verifies no-submission, pending, failure and missing-output states. The restored account page uses mocked desktop IPC to check account/conversation selection and layout bounds; a real logged-in Electron account still requires manual verification.

Generation presets verifies direct submission without parameter/confirmation dialogs, automatic landscape ratio from the actual base image, explicit submission failure and retry with the same request ID. All submissions are intercepted.

Prompt production verifies empty drafts cannot submit, generated text appears progressively, production stays disabled while drafting, completed prompts enable production, and retained dirty prompts require explicit confirmation. Drafts and video submissions are simulated.

Project library checks historical and empty projects, search, association of generated and uploaded images, image inspection, project video status and actual output counts, explicit refresh, project-only versus all works, and responsive layouts. Only read requests and browser fixtures are used.
