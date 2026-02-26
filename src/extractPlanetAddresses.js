import { setTimeout } from "node:timers/promises";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, dirname } from "node:path";
import {
  logger,
  UtahPlanetFile,
  UtahAddressFile,
  isScriptInvokedDirectly,
} from "./const.js";

/**
 * Extract the data that contains tags starting with `addr:` from the OSM planet file
 */
export async function extractPlanetAddresses() {
  try {
    await fs.rm(UtahAddressFile, { recursive: true, force: true });
  } catch (e) {}
  await fs.mkdir(dirname(UtahAddressFile), { recursive: true });

  const child = spawn(
    "osmium",
    [
      "tags-filter",
      "--remove-tags",
      "--overwrite",
      "-o",
      basename(UtahAddressFile),
      basename(UtahPlanetFile),
      "nwr/addr:*",
    ],
    { cwd: dirname(UtahPlanetFile) },
  );

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  await new Promise((resolve, reject) => {
    child.on("close", (code) => (code ? reject(code) : resolve()));
  });

  // ensure that the file is written to the disk properly
  await setTimeout(5000);

  // logger.info(`downloadCountyBoundaries.js - ${UtahAddressFile}\r\n${await fs.stat(UtahAddressFile)}`);
}

if (isScriptInvokedDirectly(import.meta)) {
  extractPlanetAddresses();
}
