const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
const serverRoot = path.join(projectRoot, ".next", "standalone");
const packageStore = path.join(serverRoot, "node_modules", ".pnpm");
const serverEntry = path.join(serverRoot, "server.js");

if (!fs.existsSync(serverEntry)) {
  throw new Error("Primero hay que generar la compilación de producción de Quercus.");
}

dotenv.config({ path: path.join(projectRoot, ".env") });

const modulePaths = [path.join(serverRoot, "node_modules")];
if (fs.existsSync(packageStore)) {
  for (const entry of fs.readdirSync(packageStore, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageModules = path.join(packageStore, entry.name, "node_modules");
    if (fs.existsSync(packageModules)) modulePaths.push(packageModules);
  }
}

process.env.HOSTNAME = "127.0.0.1";
process.env.NODE_ENV = "production";
process.env.NODE_PATH = [...modulePaths, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
process.env.PORT = "3000";
Module._initPaths();

process.chdir(serverRoot);
require(serverEntry);
