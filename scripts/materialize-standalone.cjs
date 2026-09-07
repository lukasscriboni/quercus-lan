const fs = require("node:fs/promises");
const path = require("node:path");

async function collectLinks(directory, links) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const stats = await fs.lstat(entryPath);

    if (stats.isSymbolicLink()) {
      links.push(entryPath);
    } else if (stats.isDirectory()) {
      await collectLinks(entryPath, links);
    }
  }
}

async function main() {
  const standaloneRoot = path.resolve(process.cwd(), ".next", "standalone");
  const nextRoot = path.resolve(process.cwd(), ".next");
  const expectedRoot = `${nextRoot}\\`;
  if (!standaloneRoot.startsWith(expectedRoot)) {
    throw new Error("La carpeta standalone esta fuera del proyecto.");
  }

  const links = [];
  if (process.platform === "win32") {
    await collectLinks(standaloneRoot, links);
    links.sort((left, right) => right.length - left.length);

    for (const linkPath of links) {
      const sourcePath = await fs.realpath(linkPath);
      const temporaryPath = `${linkPath}.quercus-copy`;

      await fs.rm(temporaryPath, { recursive: true, force: true });
      await fs.cp(sourcePath, temporaryPath, {
        recursive: true,
        dereference: true,
        force: true,
      });
      await fs.rm(linkPath, { recursive: true, force: true });
      await fs.rename(temporaryPath, linkPath);
    }
  }

  const staticSource = path.join(nextRoot, "static");
  const staticDestination = path.join(standaloneRoot, ".next", "static");
  await fs.rm(staticDestination, { recursive: true, force: true });
  await fs.cp(staticSource, staticDestination, { recursive: true, force: true });

  const publicSource = path.resolve(process.cwd(), "public");
  const publicDestination = path.join(standaloneRoot, "public");
  try {
    await fs.access(publicSource);
    await fs.rm(publicDestination, { recursive: true, force: true });
    await fs.cp(publicSource, publicDestination, { recursive: true, force: true });
  } catch {
    // La carpeta public es opcional.
  }

  console.log(`Paquete standalone preparado: ${links.length} enlaces convertidos y recursos copiados.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
