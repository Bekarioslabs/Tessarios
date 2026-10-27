/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Which vault folders the renderer may switch to, and the user's own copy of the bundled wiki.
// Kept free of Electron imports so it can be tested from Node.

const path = require('path');

/**
 * The folders the user has chosen before (through the folder dialog or the bundled wiki).
 * A click on a recent vault may only reopen one of these. Without that, a compromised renderer
 * could point the app at any folder on the disk and read or overwrite it.
 */
function createVaultRegistry({ loadConfig, saveConfig, platform = process.platform, limit = 20 }) {
  const same = (a, b) => (platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  const normalise = (p) => path.resolve(String(p));

  return {
    remember(vaultPath) {
      if (!vaultPath) return;
      const resolved = normalise(vaultPath);
      const config = loadConfig();
      const others = (config.knownVaults || []).filter((p) => !same(p, resolved));
      config.knownVaults = [resolved, ...others].slice(0, limit);
      saveConfig(config);
    },
    isKnown(vaultPath) {
      if (!vaultPath) return false;
      const resolved = normalise(vaultPath);
      return (loadConfig().knownVaults || []).some((p) => same(p, resolved));
    },
    normalise,
  };
}

/**
 * Copies the bundled wiki to `target` unless something is already there. An existing folder is
 * the user's own copy (maybe edited) and is never overwritten or merged into.
 * Returns 'copied' or 'existing'.
 */
async function ensureWikiCopy(fsp, fsSync, source, target) {
  if (fsSync.existsSync(target)) return 'existing';
  await fsp.cp(source, target, { recursive: true, errorOnExist: true, force: false });
  return 'copied';
}

module.exports = { createVaultRegistry, ensureWikiCopy };
