import { setTimeout } from "node:timers/promises";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, dirname } from "node:path";
import {
  logger,
  PlanetDownloadServer,
  PlanetDownloadFile,
  UtahPlanetFile,
  isScriptInvokedDirectly,
} from "./const.js";

/**
 * Download the OSM planet file
 */
export async function downloadPlanetFile() {
  try {
    await fs.rm(UtahPlanetFile, { force: true });
  } catch (e) {}
  await fs.mkdir(dirname(UtahPlanetFile), { recursive: true });

  const url = `${PlanetDownloadServer}${PlanetDownloadFile}`;

  const child = spawn(
    "curl",
    ["-L", url, "--output", basename(UtahPlanetFile)],
    { cwd: dirname(UtahPlanetFile) },
  );

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  await new Promise((resolve, reject) => {
    child.on("close", (code) => (code ? reject(code) : resolve()));
  });

  // ensure that the file is written to the disk properly
  await setTimeout(5000);

  // logger.info(`downloadCountyBoundaries.js - ${UtahPlanetFile}\r\n${await fs.stat(UtahPlanetFile)}`);
}

if (isScriptInvokedDirectly(import.meta)) {
  downloadPlanetFile();
}
