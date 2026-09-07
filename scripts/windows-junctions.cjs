const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

if (process.platform === "win32") {
  const originalSymlink = fsPromises.symlink.bind(fsPromises);

  fsPromises.symlink = async (target, destination, type) => {
    if (type === undefined || type === "dir") {
      const absoluteTarget = path.resolve(path.dirname(destination), target);
      return originalSymlink(absoluteTarget, destination, "junction");
    }

    return originalSymlink(target, destination, type);
  };

  fs.promises.symlink = fsPromises.symlink;
}
