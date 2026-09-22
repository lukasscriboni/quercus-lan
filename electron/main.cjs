const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 3210;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const HEALTH_URL = `${SERVER_URL}/api/health`;
const STARTUP_TIMEOUT_MS = 60_000;
const PRINT_POLL_INTERVAL_MS = 1_000;

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;
let logFilePath = "";
let printPollTimer = null;
let printToken = "";

function appendLog(message) {
  if (!logFilePath) return;

  try {
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    // Logging must never prevent the application from opening.
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");
  for (const sourceLine of contents.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const hasMatchingQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (hasMatchingQuotes) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function getRuntimePaths() {
  if (app.isPackaged) {
    const serverRoot = path.join(process.resourcesPath, "app");
    return {
      serverRoot,
      serverEntry: path.join(serverRoot, "server.js"),
      envFile: path.join(serverRoot, ".env"),
    };
  }

  const projectRoot = path.resolve(__dirname, "..");
  const serverRoot = path.join(projectRoot, ".next", "standalone");
  return {
    serverRoot,
    serverEntry: path.join(serverRoot, "server.js"),
    envFile: path.join(projectRoot, ".env"),
  };
}

function buildRuntimeModulePath(serverRoot) {
  const modulePaths = [path.join(serverRoot, "node_modules")];
  const packageStore = path.join(serverRoot, "node_modules", ".pnpm");

  if (fs.existsSync(packageStore)) {
    for (const packageDirectory of fs.readdirSync(packageStore, { withFileTypes: true })) {
      if (!packageDirectory.isDirectory()) continue;
      const packageModules = path.join(packageStore, packageDirectory.name, "node_modules");
      if (fs.existsSync(packageModules)) modulePaths.push(packageModules);
    }
  }

  if (process.env.NODE_PATH) modulePaths.push(process.env.NODE_PATH);
  return modulePaths.join(path.delimiter);
}

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (serverProcess?.exitCode !== null) {
        reject(new Error(`El servidor interno se cerro con codigo ${serverProcess.exitCode}.`));
        return;
      }

      const request = http.get(HEALTH_URL, { timeout: 2_000 }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const health = JSON.parse(body);
            if (response.statusCode === 200 && health.status === "ok") {
              resolve();
              return;
            }
          } catch {
            // The endpoint is not ready yet.
          }

          retryOrReject();
        });
      });

      request.on("timeout", () => request.destroy());
      request.on("error", retryOrReject);
    };

    const retryOrReject = () => {
      if (Date.now() >= deadline) {
        reject(new Error("La aplicacion no pudo conectarse con la base de datos dentro del tiempo esperado."));
        return;
      }
      setTimeout(check, 500);
    };

    check();
  });
}

function startServer() {
  const runtime = getRuntimePaths();
  parseEnvFile(runtime.envFile);

  if (!fs.existsSync(runtime.serverEntry)) {
    throw new Error(`No se encontro el servidor de Quercus en ${runtime.serverEntry}`);
  }

  appendLog(`Iniciando servidor desde ${runtime.serverEntry}`);
  serverProcess = spawn(process.execPath, [runtime.serverEntry], {
    cwd: runtime.serverRoot,
    env: {
      ...process.env,
      APP_HTTPS: "false",
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: SERVER_HOST,
      NODE_ENV: "production",
      NODE_PATH: buildRuntimeModulePath(runtime.serverRoot),
      PORT: String(SERVER_PORT),
      QUERCUS_PRINT_TOKEN: printToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (chunk) => appendLog(`[servidor] ${chunk.toString().trimEnd()}`));
  serverProcess.stderr.on("data", (chunk) => appendLog(`[servidor:error] ${chunk.toString().trimEnd()}`));
  serverProcess.on("error", (error) => appendLog(`[proceso:error] ${error.stack || error.message}`));
  serverProcess.on("exit", (code, signal) => {
    appendLog(`Servidor detenido. Codigo=${code ?? "-"} Senal=${signal ?? "-"}`);
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      showStartupError(new Error("El servidor interno de Quercus se detuvo inesperadamente."));
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function printJobHtml(job) {
  const rows = job.items.map((item) => `<div class="item"><b>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</b>${item.notes ? `<small>NOTA: ${escapeHtml(item.notes)}</small>` : ""}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:3mm}body{font-family:Arial,sans-serif;color:#000;margin:0;font-size:13px}.center{text-align:center}h1{font-size:20px;margin:0 0 5px}.meta{border-bottom:1px dashed #000;padding-bottom:7px;margin-bottom:7px}.item{padding:6px 0;border-bottom:1px dashed #777;font-size:15px}.item small{display:block;margin-top:3px;font-weight:bold}.footer{margin-top:8px;font-size:11px}</style></head><body><div class="center meta"><h1>${escapeHtml(job.stationName)}</h1><b>${escapeHtml(job.location)}</b><br>Pedido #${escapeHtml(job.orderNumber)}</div>${rows}<div class="center footer">${escapeHtml(new Date(job.createdAt).toLocaleString("es-AR"))}<br>Ingresó: ${escapeHtml(job.openedBy)}</div></body></html>`;
}

async function printKitchenJob(job) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(printJobHtml(job))}`);
    const printers = await printWindow.webContents.getPrintersAsync();
    const configuredName = job.stationType === "BAR" ? process.env.QUERCUS_BAR_PRINTER : process.env.QUERCUS_KITCHEN_PRINTER;
    const printer = configuredName ? printers.find((candidate) => candidate.name.toLocaleLowerCase() === configuredName.toLocaleLowerCase()) : printers.find((candidate) => candidate.isDefault);
    if (configuredName && !printer) throw new Error(`No se encontró la ticketera configurada: ${configuredName}`);
    await new Promise((resolve, reject) => printWindow.webContents.print({ silent: true, printBackground: true, deviceName: printer?.name }, (success, reason) => success ? resolve() : reject(new Error(reason || "La impresión fue rechazada"))));
    appendLog(`Comanda ${job.orderNumber} enviada a ${printer?.name || "impresora predeterminada"} (${job.stationType}).`);
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

function pollKitchenPrintJobs() {
  const request = http.get(`${SERVER_URL}/api/internal/kitchen-print-jobs`, { headers: { "x-quercus-print-token": printToken }, timeout: 2_000 }, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        for (const job of payload.jobs ?? []) await printKitchenJob(job);
      } catch (error) {
        appendLog(`[impresion:error] ${error.stack || error.message}`);
      }
    });
  });
  request.on("timeout", () => request.destroy());
  request.on("error", (error) => appendLog(`[impresion:conexion] ${error.message}`));
}

function stopServer() {
  if (serverProcess && serverProcess.exitCode === null && !serverProcess.killed) {
    serverProcess.kill();
  }
  serverProcess = null;
}

function isLocalApplicationUrl(targetUrl) {
  return targetUrl === "about:blank" || targetUrl.startsWith(`${SERVER_URL}/`);
}

function secureWebContents(webContents) {
  webContents.on("will-navigate", (event, targetUrl) => {
    if (isLocalApplicationUrl(targetUrl)) return;
    event.preventDefault();
    if (/^https?:/i.test(targetUrl)) void shell.openExternal(targetUrl);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalApplicationUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 920,
          height: 760,
          minWidth: 640,
          minHeight: 520,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

function loadingPage() {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Quercus</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101715; color: #f3f5f2; font-family: system-ui, sans-serif; }
          main { text-align: center; }
          .mark { width: 76px; height: 76px; margin: 0 auto 20px; display: grid; place-items: center; border-radius: 22px; background: #c8973f; color: #101715; font: 800 42px Georgia, serif; box-shadow: 0 18px 55px #0008; }
          h1 { margin: 0 0 8px; font: 700 36px Georgia, serif; }
          p { margin: 0; color: #b9c2bc; }
          .loader { width: 160px; height: 3px; margin: 26px auto 0; overflow: hidden; border-radius: 999px; background: #2a3530; }
          .loader::after { content: ""; display: block; width: 45%; height: 100%; background: #c8973f; animation: move 1s ease-in-out infinite alternate; }
          @keyframes move { to { transform: translateX(122%); } }
        </style>
      </head>
      <body><main><div class="mark">Q</div><h1>Quercus</h1><p>Preparando la aplicacion...</p><div class="loader"></div></main></body>
    </html>`)} `;
}

function errorPage(message) {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Quercus - Error</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; background: #101715; color: #f3f5f2; font-family: system-ui, sans-serif; }
          main { width: min(560px, 100%); padding: 34px; border: 1px solid #35423c; border-radius: 20px; background: #17201c; box-shadow: 0 18px 55px #0008; }
          h1 { margin: 0 0 14px; font: 700 30px Georgia, serif; }
          p { line-height: 1.6; color: #c9d0cc; }
          code { color: #e7c782; word-break: break-all; }
        </style>
      </head>
      <body><main><h1>No se pudo iniciar Quercus</h1><p>${message}</p><p>Verifica que PostgreSQL este iniciado y vuelve a abrir la aplicacion.</p><p>Registro tecnico:<br /><code>${logFilePath}</code></p></main></body>
    </html>`)} `;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: "#101715",
    title: "Quercus",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  secureWebContents(mainWindow.webContents);
  mainWindow.webContents.on("did-create-window", (childWindow) => {
    childWindow.setMenuBarVisibility(false);
    secureWebContents(childWindow.webContents);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(loadingPage());
}

function showStartupError(error) {
  appendLog(error.stack || error.message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow.loadURL(errorPage(error.message));
  }
}

async function startApplication() {
  logFilePath = path.join(app.getPath("userData"), "quercus-server.log");
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  appendLog(`Inicio de Quercus Desktop ${app.getVersion()}`);
  printToken = `${Date.now()}-${Math.random().toString(36).slice(2)}-${process.pid}`;

  Menu.setApplicationMenu(null);
  createMainWindow();

  try {
    startServer();
    await waitForServer(STARTUP_TIMEOUT_MS);
    printPollTimer = setInterval(pollKitchenPrintJobs, PRINT_POLL_INTERVAL_MS);
    appendLog("Servidor disponible; abriendo la interfaz.");
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(`${SERVER_URL}/login`);
    }
  } catch (error) {
    showStartupError(error instanceof Error ? error : new Error(String(error)));
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(startApplication);
}

app.on("before-quit", () => {
  isQuitting = true;
  if (printPollTimer) clearInterval(printPollTimer);
  stopServer();
});

app.on("window-all-closed", () => {
  app.quit();
});
