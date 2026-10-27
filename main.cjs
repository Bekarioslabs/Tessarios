/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs').promises;
const fsSync = require('fs');
const { createVaultRegistry, ensureWikiCopy } = require('./electron/vaultAccess.cjs');

const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'config.json');

function loadConfig() {
  try {
    if (fsSync.existsSync(configFilePath)) {
      const data = fsSync.readFileSync(configFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Failed to load config:', e);
  }
  return {};
}

function saveConfig(config) {
  try {
    fsSync.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save config:', e);
  }
}

let activeVaultPath = loadConfig().activeVaultPath || null;
if (activeVaultPath && !fsSync.existsSync(activeVaultPath)) {
  activeVaultPath = null;
}

// Folders the user has chosen before. The recent-vaults list may only reopen one of these, never an
// arbitrary path from the renderer.
const knownVaults = createVaultRegistry({ loadConfig, saveConfig });
if (activeVaultPath) knownVaults.remember(activeVaultPath);

function validatePath(relativePath) {
  if (!activeVaultPath) throw new Error('Vault not initialized');
  const resolvedVaultPath = path.resolve(activeVaultPath);
  const fullPath = path.resolve(activeVaultPath, relativePath);
  // Must be the vault root itself, or a real subpath of it (not just a string-prefix
  // match — e.g. a vault at ".../Tresor" must not accept ".../Tresor2/...").
  if (fullPath !== resolvedVaultPath && !fullPath.startsWith(resolvedVaultPath + path.sep)) {
    throw new Error('Path traversal attempt rejected');
  }
  return fullPath;
}

let mainWindow;

// Depending on how we run it. If in dev, load from the Vite dev server.
// If in production, load from dist/index.html
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
// Vite binds either 127.0.0.1 or [::1] depending on how the OS resolves "localhost" on a
// given run, so probing a single spelling can miss a server that is demonstrably up. Try
// every candidate and load whichever actually answers.
const DEV_SERVER_CANDIDATES = process.env.VITE_DEV_SERVER_URL
  ? [process.env.VITE_DEV_SERVER_URL]
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'];
const SHELL_PATH = path.join(__dirname, 'electron', 'loading.html');

const DEV_PROBE_ATTEMPTS = 60;        // 60 x 500ms = up to 30s waiting for Vite
const DEV_PROBE_INTERVAL_MS = 500;
const DEV_PROBE_TIMEOUT_MS = 2000;
const MOUNT_TIMEOUT_MS = 20000;       // how long the UI gets to actually render
const MOUNT_POLL_INTERVAL_MS = 400;

protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ==========================================================================
   Startup shell
   The window always shows electron/loading.html first, so a slow start looks
   like visible progress and a broken one produces a real error message —
   instead of the bare white window that used to require a force reload.
   ========================================================================== */

let shellVisible = false;
let queuedShellJs = [];
let subresourceFailures = [];
let loadToken = 0; // bumped on every (re)start so superseded async work bails out

function shellExec(js) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (shellVisible) {
    mainWindow.webContents.executeJavaScript(js).catch(() => {});
  } else {
    queuedShellJs.push(js);
  }
}

function setShellStatus(text) {
  shellExec(`window.__shell && window.__shell.setStatus(${JSON.stringify(text)})`);
}

function showShell(query) {
  shellVisible = false;
  queuedShellJs = [];
  return mainWindow
    .loadFile(SHELL_PATH, query ? { query } : undefined)
    .catch((err) => console.error('Could not display startup shell:', err));
}

function showStartupError(title, detail) {
  console.error(`[startup] ${title}\n${detail}`);
  return showShell({ state: 'error', title, detail: String(detail).slice(0, 1500) });
}

/** Resolves true once `url` answers a real HTTP request — not merely once its socket is
 *  open. `wait-on tcp:` accepted the open socket, which let Electron load before Vite had
 *  finished optimizing dependencies. */
function probeUrl(url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };

    let request;
    const timer = setTimeout(() => {
      try { if (request) request.abort(); } catch {}
      finish(false);
    }, DEV_PROBE_TIMEOUT_MS);

    try {
      request = net.request(url);
    } catch {
      clearTimeout(timer);
      return finish(false);
    }

    request.on('response', (response) => {
      clearTimeout(timer);
      response.on('data', () => {});
      response.on('end', () => {});
      finish(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.on('error', () => { clearTimeout(timer); finish(false); });
    request.on('abort', () => { clearTimeout(timer); finish(false); });

    try {
      request.end();
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}

/** Returns the first dev-server URL that responds, or null if none do. */
async function findDevServer() {
  for (const url of DEV_SERVER_CANDIDATES) {
    if (await probeUrl(url)) return url;
  }
  return null;
}

/** A page can finish loading and still render nothing — exactly what the stale-dev-server
 *  bug looked like (index.html arrives, its assets 404). Poll the React root until it has
 *  children; if it never does, report the subresource failures we collected. */
async function verifyMounted(token) {
  const deadline = Date.now() + MOUNT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (token !== loadToken || !mainWindow || mainWindow.isDestroyed()) return;
    let mounted = false;
    try {
      mounted = await mainWindow.webContents.executeJavaScript(
        `!!document.getElementById('root') && document.getElementById('root').childElementCount > 0`
      );
    } catch {
      // Page is mid-navigation; retry on the next poll.
    }
    if (mounted) return;
    await delay(MOUNT_POLL_INTERVAL_MS);
  }

  if (token !== loadToken) return;

  const failures = subresourceFailures.slice(0, 8).join('\n');
  showStartupError(
    'Oberfläche konnte nicht starten',
    (failures
      ? `Diese Dateien konnten nicht geladen werden:\n${failures}`
      : 'Die Seite wurde geladen, aber die Oberfläche hat sich nicht aufgebaut.') +
      (isDev
        ? '\n\nMeist läuft noch ein alter Entwicklungsserver. Schließe alle Fenster und starte "npm run electron:dev" neu.'
        : '\n\nDer Produktions-Build ist möglicherweise veraltet. Führe "npm run build" aus und starte erneut.')
  );
}

async function startAppLoad() {
  const token = ++loadToken;
  subresourceFailures = [];
  await showShell();
  if (token !== loadToken) return;

  if (!isDev) {
    setShellStatus('Lade Anwendung…');
    try {
      // Note: since base is './' in vite.config.ts, this should work locally
      await mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    } catch (e) {
      if (token === loadToken) {
        showStartupError(
          'Anwendung konnte nicht geladen werden',
          `Der Produktions-Build unter dist/ fehlt oder ist beschädigt.\n` +
          `Führe "npm run build" aus und starte erneut.\n\n${e}`
        );
      }
    }
    return;
  }

  for (let attempt = 1; attempt <= DEV_PROBE_ATTEMPTS; attempt++) {
    if (token !== loadToken) return;
    setShellStatus(`Warte auf Entwicklungsserver… (${attempt}/${DEV_PROBE_ATTEMPTS})`);

    const url = await findDevServer();
    if (url) {
      if (token !== loadToken) return;
      setShellStatus('Entwicklungsserver bereit — lade Anwendung…');
      try {
        await mainWindow.loadURL(url);
      } catch (e) {
        if (token === loadToken) showStartupError('Laden fehlgeschlagen', `${url}\n\n${e}`);
      }
      return;
    }
    await delay(DEV_PROBE_INTERVAL_MS);
  }

  if (token !== loadToken) return;
  showStartupError(
    'Entwicklungsserver nicht erreichbar',
    `Keine Antwort unter:\n${DEV_SERVER_CANDIDATES.join('\n')}\n\n` +
    'Starte die App über "npm run electron:dev" — dieser Befehl startet den Entwicklungsserver mit.\n' +
    'Läuft er bereits in einem anderen Fenster, beende ihn dort zuerst.'
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Matches the app background so a cold start never flashes white.
    backgroundColor: '#09090b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const wc = mainWindow.webContents;

  wc.on('did-finish-load', () => {
    const url = wc.getURL();
    if (url.startsWith('file://') && url.includes('loading.html')) {
      shellVisible = true;
      const queued = queuedShellJs;
      queuedShellJs = [];
      for (const js of queued) wc.executeJavaScript(js).catch(() => {});
      return;
    }
    shellVisible = false;
    verifyMounted(loadToken);
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (errorCode === -3) return; // ERR_ABORTED — normal when one navigation supersedes another
    if (!isMainFrame) subresourceFailures.push(`${validatedURL} — ${errorDescription}`);
  });

  // Surface renderer errors in the terminal during development; without this a crashing
  // bundle looks identical to a hanging one from the main process's point of view.
  if (isDev) {
    wc.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) console.error(`[renderer] ${message}  (${sourceId}:${line})`);
    });
  }

  startAppLoad();
}

ipcMain.handle('shell:retry-load', () => {
  startAppLoad();
});

app.whenReady().then(() => {
  // Only enforced in production: the Vite dev server needs 'unsafe-eval' for HMR,
  // and locking that down here would break `npm run electron:dev`. The AI base URL
  // (LM Studio/Ollama/remote) is user-configurable in Settings, so connect-src stays
  // open to http/https rather than an allowlist that would silently break it.
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self' data:; " +
            "img-src 'self' data: blob: vault:; " +
            "connect-src 'self' http: https:; " +
            "object-src 'none'; " +
            "base-uri 'none';"
          ],
        },
      });
    });
  }

  protocol.handle('vault', async (request) => {
    if (!activeVaultPath) return new Response('Vault not initialized', { status: 400 });
    // URL format is vault://relativePath/to/file.png
    const relativePath = request.url.replace(/^(vault:\/*)+/i, '');
    try {
      const fullPath = validatePath(decodeURIComponent(relativePath));
      const data = await fs.readFile(fullPath);
      let mimeType = 'application/octet-stream';
      const ext = path.extname(fullPath).toLowerCase();
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.svg') mimeType = 'image/svg+xml';
      else if (ext === '.gif') mimeType = 'image/gif';
      
      return new Response(data, {
        headers: { 'Content-Type': mimeType, 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {
      console.error('Vault protocol error:', e);
      return new Response('Access denied or file not found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('vault:initialize', async (event, options) => {
  const forcePrompt = options && (options.prompt || options.forcePrompt);
  
  if (activeVaultPath && !fsSync.existsSync(activeVaultPath)) {
    activeVaultPath = null;
  }

  // Reopen a vault from the recent list: only folders chosen before, and only if they still exist.
  if (options && options.targetPath) {
    const wanted = knownVaults.normalise(options.targetPath);
    if (!knownVaults.isKnown(wanted) || !fsSync.existsSync(wanted)) return false;
    activeVaultPath = wanted;
    const config = loadConfig();
    config.activeVaultPath = wanted;
    saveConfig(config);
  }

  if (!activeVaultPath || forcePrompt) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Tresor-Ordner auswählen',
      buttonLabel: 'Als Tresor verwenden'
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return activeVaultPath ? true : false;
    }
    activeVaultPath = result.filePaths[0];
    
    const config = loadConfig();
    config.activeVaultPath = activeVaultPath;
    saveConfig(config);
    knownVaults.remember(activeVaultPath);
  }

  // Ensure default vault structure exists.
  // NOTE: the category folders mirror CATEGORY_FOLDERS in src/utils/markdown.ts, which is
  // the single source of truth for type -> folder. This copy exists only because the main
  // process is CommonJS and can't import the renderer's ES module — update both together.
  const categoryDirs = [
    'Books', 'Chapters', 'Scenes', 'Characters', 'Relationships', 'Items', 'Maps',
    'Powers', 'Lore', 'Organizations', 'Places', 'Storylines', 'Brainstorms', 'Notes', 'Visuals',
  ];
  const dirs = [...categoryDirs, 'assets', '.tessarios', '.tessarios/backups', '.tessarios/full-backups'];
  for (const d of dirs) {
    await fs.mkdir(path.join(activeVaultPath, d), { recursive: true }).catch(() => {});
  }

  return true;
});

ipcMain.handle('vault:getName', () => {
  return activeVaultPath ? path.basename(activeVaultPath) : 'Unknown Vault';
});

// The recent-vaults list needs the full path to reopen a vault; the name alone is not enough.
ipcMain.handle('vault:getPath', () => activeVaultPath || '');

// The wiki that ships with the app: the folder "Tessarios Wiki" next to the exe (examples/wiki-vault
// when running from source). The renderer never supplies a path; this process decides.
function bundledWikiPath() {
  const source = app.isPackaged
    ? path.join(path.dirname(process.execPath), 'Tessarios Wiki')
    : path.join(app.getAppPath(), 'examples', 'wiki-vault');
  return fsSync.existsSync(path.join(source, 'Notes')) ? source : null;
}

ipcMain.handle('wiki:isAvailable', () => bundledWikiPath() !== null);

// Opens the wiki as the user's own copy in Documents, so the shipped original stays untouched.
// An existing "Tessarios Wiki" folder in Documents is reused as it is, never overwritten.
ipcMain.handle('wiki:open', async () => {
  const source = bundledWikiPath();
  if (!source) return false;
  const target = path.join(app.getPath('documents'), 'Tessarios Wiki');
  await ensureWikiCopy(fs, fsSync, source, target);
  activeVaultPath = target;
  const config = loadConfig();
  config.activeVaultPath = target;
  saveConfig(config);
  knownVaults.remember(target);
  return true;
});

ipcMain.handle('vault:readFile', async (event, relativePath) => {
  const fullPath = validatePath(relativePath);
  return await fs.readFile(fullPath, 'utf8');
});

ipcMain.handle('vault:readBinaryFile', async (event, relativePath) => {
  const fullPath = validatePath(relativePath);
  const data = await fs.readFile(fullPath);
  return data;
});

ipcMain.handle('vault:writeFile', async (event, relativePath, content, exclusive) => {
  const fullPath = validatePath(relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  try {
    await fs.writeFile(fullPath, content, { encoding: 'utf8', flag: exclusive ? 'wx' : 'w' });
  } catch (e) {
    // 'wx' fails atomically if the file already exists — used by the renderer's collision
    // check to avoid a check-then-write race where another write could land in between.
    if (exclusive && e.code === 'EEXIST') throw new Error('EEXIST: target file already exists');
    throw e;
  }
});

ipcMain.handle('vault:writeBinaryFile', async (event, relativePath, content) => {
  const fullPath = validatePath(relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(content));
});

ipcMain.handle('vault:deleteFile', async (event, relativePath) => {
  const fullPath = validatePath(relativePath);
  await fs.unlink(fullPath);
});

ipcMain.handle('vault:listFiles', async (event, relativeDirectoryPath) => {
  const searchDir = relativeDirectoryPath 
    ? validatePath(relativeDirectoryPath)
    : activeVaultPath;

  if (!searchDir) throw new Error('Vault not initialized');

  const results = [];
  
  async function walk(dir, basePath = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const res = path.resolve(dir, entry.name);
        const rel = path.posix.join(basePath, entry.name); // Always use posix for internal paths
        
        if (entry.isDirectory()) {
          await walk(res, rel);
        } else {
          results.push(rel);
        }
      }
    } catch (e) {
      // Ignore if dir doesn't exist
    }
  }

  // Seed with the requested directory so results are always relative to the VAULT ROOT,
  // matching what every caller assumes (readFile/writeFile/deleteFile all take vault-root-
  // relative paths). Previously this defaulted to '', so listFiles('assets') returned bare
  // filenames instead of 'assets/<file>' — silently breaking asset export (a startsWith
  // check on the prefix was always false), custom template loading (readFile on a bare
  // filename 404'd), and backup pruning/reading (deleteFile/readFile on a bare filename
  // resolved to the wrong location).
  await walk(searchDir, relativeDirectoryPath || '');
  return results;
});

// Keyed by a request id the renderer generates per send. A local model can take long
// enough on a slow machine that the only way out used to be closing the whole app — this
// is what `ai:chatCancel` reaches into to abort cleanly instead.
const activeAiRequests = new Map();

// `temperature` comes from the caller because the working mode decides it — muse wants
// 0.9, an editor or a canon check wants 0.2. It used to be hardcoded to 0.7 here, which
// silently discarded that choice and made every mode sound the same.
ipcMain.handle('ai:chat', async (event, provider, baseUrl, model, messages, temperature, requestId) => {
  const controller = new AbortController();
  if (requestId) activeAiRequests.set(requestId, controller);

  try {
    const requestedTemp = typeof temperature === 'number' && temperature >= 0 && temperature <= 2
      ? temperature
      : 0.7;

    const response = await net.fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not-needed'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: requestedTemp
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    // A deliberate cancel, not a failure — carries a marker the renderer checks for
    // instead of a string match on the AbortError's own wording, which varies by runtime.
    if (error.name === 'AbortError') {
      throw new Error('AI_REQUEST_CANCELLED');
    }
    throw new Error(`AI request error: ${error.message}`);
  } finally {
    if (requestId) activeAiRequests.delete(requestId);
  }
});

/** Best-effort: aborts the named request if it is still running, no-ops otherwise — it
 *  may already have finished by the time this arrives, which is a normal race, not a bug. */
ipcMain.handle('ai:chatCancel', async (event, requestId) => {
  const controller = activeAiRequests.get(requestId);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
});

ipcMain.handle('ai:listModels', async (event, provider, baseUrl) => {
  try {
    const cleanUrl = (baseUrl || '').replace(/\/+$/, '');
    const targetUrl = cleanUrl || (provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1');

    // 1. Try OpenAI-compatible /models endpoint
    try {
      const response = await net.fetch(`${targetUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer not-needed' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.data) && data.data.length > 0) {
          return data.data.map(m => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
        }
      }
    } catch (err) {
      // Fallback for native Ollama API endpoint if /v1/models fails
    }

    // 2. Ollama native API fallback: /api/tags
    if (provider === 'ollama') {
      const origin = targetUrl.replace(/\/v1$/, '');
      const nativeResp = await net.fetch(`${origin}/api/tags`, { method: 'GET' });
      if (nativeResp.ok) {
        const nativeData = await nativeResp.json();
        if (nativeData && Array.isArray(nativeData.models) && nativeData.models.length > 0) {
          return nativeData.models.map(m => m.name || m.model).filter(Boolean);
        }
      }
    }

    throw new Error(`Keine Modelle unter ${targetUrl} gefunden. Stelle sicher, dass der Server gestartet ist.`);
  } catch (error) {
    throw new Error(`Verbindung fehlgeschlagen: ${error.message}`);
  }
});

/**
 * Best-effort lookup of the context length the server is actually running a model with.
 * Neither the OpenAI-compatible shape nor Ollama guarantees this field, and the names
 * differ per server and version — so every candidate is tried and `null` is a normal
 * answer, not an error. The caller falls back to what the author entered by hand.
 */
ipcMain.handle('ai:contextLength', async (event, provider, baseUrl, model) => {
  const cleanUrl = (baseUrl || '').replace(/\/+$/, '');
  const targetUrl = cleanUrl || (provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1');

  const pickNumber = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    const keys = [
      'max_context_length', 'context_length', 'max_model_len', 'n_ctx',
      'context_window', 'max_position_embeddings', 'loaded_context_length',
    ];
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'number' && value > 0) return value;
    }
    return null;
  };

  // 1. LM Studio's own REST API (/api/v0/models, at the origin — not under /v1). This is
  // the one place the *actually allocated* context is reported: `loaded_context_length`
  // is what the running server really has room for right now, which can be smaller than
  // the model's architectural `max_context_length`. The OpenAI-compatible /v1/models
  // LM Studio also serves carries neither field — checking only that shape was a bug
  // that made this handler return null for every LM Studio user.
  if (provider !== 'ollama') {
    try {
      const origin = targetUrl.replace(/\/v1$/, '');
      const response = await net.fetch(`${origin}/api/v0/models`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        const entries = Array.isArray(data?.data) ? data.data : [];
        const match =
          entries.find(m => m?.id === model) ||
          entries.find(m => m?.state === 'loaded') ||
          null;
        if (match) {
          const loaded = typeof match.loaded_context_length === 'number' ? match.loaded_context_length : null;
          const max = typeof match.max_context_length === 'number' ? match.max_context_length : null;
          if (loaded && loaded > 0) return loaded;
          if (max && max > 0) return max;
        }
      }
    } catch (err) {
      // Not LM Studio, an old version, or unreachable — fall through.
    }
  }

  // 2. OpenAI-compatible /models as a generic fallback — some other servers do carry a
  // context field directly on the model entry, though nothing guarantees it.
  try {
    const response = await net.fetch(`${targetUrl}/models`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer not-needed' }
    });
    if (response.ok) {
      const data = await response.json();
      const entries = Array.isArray(data?.data) ? data.data : [];
      const match = entries.find(m => (m?.id || m?.name) === model) || entries[0];
      const direct = pickNumber(match);
      if (direct) return direct;
      const nested = pickNumber(match?.model_info) || pickNumber(match?.config);
      if (nested) return nested;
    }
  } catch (err) {
    // Server unreachable or a different shape — fall through.
  }

  // 3. Ollama native /api/show carries it under model_info with a family-prefixed key.
  if (provider === 'ollama' && model) {
    try {
      const origin = targetUrl.replace(/\/v1$/, '');
      const resp = await net.fetch(`${origin}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model })
      });
      if (resp.ok) {
        const data = await resp.json();
        const info = data?.model_info || {};
        const ctxKey = Object.keys(info).find(k => k.endsWith('.context_length'));
        if (ctxKey && typeof info[ctxKey] === 'number') return info[ctxKey];
        const direct = pickNumber(info);
        if (direct) return direct;
      }
    } catch (err) {
      // Not available — the manual setting stands.
    }
  }

  return null;
});

const JSZip = require('jszip');
ipcMain.handle('vault:createFullBackup', async () => {
  if (!activeVaultPath) throw new Error('Vault not initialized');
  
  const zip = new JSZip();
  const backupFolder = path.join(activeVaultPath, '.tessarios', 'full-backups');
  await fs.mkdir(backupFolder, { recursive: true }).catch(() => {});

  // Add files to zip
  async function addDirToZip(dirPath, zipFolder) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Exclude full-backups and backups directory from ZIP snapshot
      if (entry.isDirectory() && (entry.name === 'full-backups' || entry.name === 'backups') && dirPath.endsWith('.tessarios')) continue;

      if (entry.isDirectory()) {
        const subZip = zipFolder.folder(entry.name);
        await addDirToZip(fullPath, subZip);
      } else {
        const data = await fs.readFile(fullPath);
        zipFolder.file(entry.name, data);
      }
    }
  }

  await addDirToZip(activeVaultPath, zip);

  // Generate timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipName = `${timestamp}.zip`;
  const zipPath = path.join(backupFolder, zipName);

  // Write zip with DEFLATE compression (saves massive disk space for images and notes)
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await fs.writeFile(zipPath, content);

  // Rotate backups to keep only 5
  const files = await fs.readdir(backupFolder);
  const zipFiles = files.filter(f => f.endsWith('.zip'));
  if (zipFiles.length > 5) {
    // Sort oldest first
    zipFiles.sort();
    const toDelete = zipFiles.slice(0, zipFiles.length - 5);
    for (const f of toDelete) {
      await fs.unlink(path.join(backupFolder, f)).catch(() => {});
    }
  }

  return zipName;
});
