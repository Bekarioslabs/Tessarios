# Security policy

Tessarios is a local desktop app. It keeps your writing as Markdown files in a folder you
choose, has no account and no telemetry, and makes no network requests of its own. The only
traffic is to the AI address you set under *Local AI* (by default LM Studio or Ollama on
your own computer).

## Supported versions

Only the latest commit on `main` and the latest release are supported.

## What the app is built to guarantee

- The renderer has no filesystem access; every file operation goes through the main process,
  which checks that the path stays inside the open vault.
- Before an existing entry is overwritten or deleted, its previous version is saved under
  `.tessarios/backups/`.
- The AI only proposes text. A change reaches a file after you confirm it.
- A content security policy blocks everything except local files and the AI address.

## Supply chain

- `npm ci` installs exactly what the lockfile says.
- Dependabot watches npm packages and GitHub Actions; CI audits production dependencies and
  pins actions to commit SHAs.
- `THIRD_PARTY_NOTICES.md` is generated from the shipped bundle and checked in CI.
- Builds are not code-signed yet. Treat a downloaded build as software from a small project:
  build from source, or compare against the checksums published with a release.

## Reporting a vulnerability

Please do not open a public issue. Write to **dev@bekarioslabs.de**, or use GitHub's private
vulnerability reporting for this repository. Helpful details:

- version or commit and Windows version
- exact steps to reproduce, expected and actual result
- whether vault files could be read, changed or deleted

You will get an answer as soon as a single maintainer can manage; there is no bounty.
