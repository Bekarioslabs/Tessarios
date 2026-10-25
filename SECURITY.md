# Security policy

Tessarios is finished. There will be no security updates, no fixes and no replies to reports.
If you need a fix, fork the code.

Tessarios is a local desktop app. It keeps your writing as Markdown files in a folder you
choose, has no account and no telemetry, and makes no network requests of its own. The only
traffic is to the AI address you set under *Local AI* (by default LM Studio or Ollama on
your own computer).

## What the app is built to guarantee

- The renderer has no filesystem access; every file operation goes through the main process,
  which checks that the path stays inside the open vault.
- Before an existing entry is overwritten or deleted, its previous version is saved under
  `.tessarios/backups/`.
- The AI only proposes text. A change reaches a file after you confirm it.
- A content security policy blocks everything except local files and the AI address.

## Known limits

- Builds are not code-signed, so Windows SmartScreen will warn. If you would rather not
  trust a download, build from source.
- There is no update check. The Chromium inside Electron stays at the version of the build
  and will age. The app loads no remote content, which limits the exposure, but do not use
  it to browse the web.
- When the last version was built, `npm audit` reported no known vulnerabilities in the
  dependencies. `THIRD_PARTY_NOTICES.md` lists what is shipped.
