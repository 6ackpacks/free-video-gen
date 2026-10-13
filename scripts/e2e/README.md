# Browser interaction checks

Start the local app and install Python Playwright (`pip install playwright`, then `python -m playwright install chromium`). Run from the repository root:

```text
python scripts/e2e/interactions.py
python scripts/e2e/creative-materials.py
python scripts/e2e/library-and-works.py
python scripts/e2e/industry-actions.py
```

Set `E2E_BASE_URL` if the server uses a port other than 4192. The application must have the normal built-in catalogs and the video-route configurations used by these scenarios. No external generation service is invoked: project/material/template writes and video submissions are intercepted inside each browser context. Server domain and provider-request behavior is tested separately with `npm test`.

Evidence is written under ignored `data/` directories. The scenarios cover project creation, industry input, stable action selection, product/person/scene roles, file selection and upload, mandatory generation parameters, submission recovery, specialty massage configuration, works management, navigation, and responsive layouts. They do not validate real provider output or Electron's native login window.
