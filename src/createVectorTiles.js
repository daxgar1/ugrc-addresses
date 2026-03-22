import { promises as fs } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { spawn } from "node:child_process";
import {
  OutputFolder,
  VectorTileFileName,
  isScriptInvokedDirectly,
} from "./const.js";

const countyFilePath = join(OutputFolder, "counties.json");

/**
 * Converts the GeoJSON address point files into `.pmtiles` vector tile files
 */
export async function createVectorTiles() {
  const counties = JSON.parse(await fs.readFile(countyFilePath)).counties;

  try {
    await fs.rm(join(OutputFolder, VectorTileFileName), { force: true });
  } catch (e) {}

  // Extract the GeoJSON address point file names
  const missingAddressPointFiles = [];
  const partialAddressPointFiles = [];
  for (const county of counties) {
    missingAddressPointFiles.push(county.missingPath);
    partialAddressPointFiles.push(county.partialPath);
  }

  // Create the base tile file that will contain all of the addresses
  const child = spawn(
    "tippecanoe",
    [
      "-zg",
      "-o",
      VectorTileFileName,
      "-n",
      "Utah Addresses",
      "-A",
      `Address Data © <a target="_blank" href="https://gis.utah.gov/documentation/policy/license/">UGRC SGID</a> under <a target="_blank" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>`,
      "-N",
      "Processed address points from the Utah UGRC SGID address points dataset for use in OSM",
      "-l",
      "addresses",
      "--drop-densest-as-needed",
      "--extend-zooms-if-still-dropping",
      "--force",
      ...missingAddressPointFiles,
      ...partialAddressPointFiles,
    ],
    { cwd: OutputFolder },
  );

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  await new Promise((resolve, reject) => {
    child.on("close", (code) => (code ? reject(code) : resolve()));
  });

  // Create a tile file that will contain all of the missing addresses, without any internal data. This is intended for use in OSM editors like Rapid or JOSM
  const child2 = spawn(
    "tippecanoe",
    [
      "-zg",
      "-o",
      `missing-${VectorTileFileName}`,
      "-n",
      "Utah Addresses",
      "-A",
      `Address Data © <a target="_blank" href="https://gis.utah.gov/documentation/policy/license/">UGRC SGID</a> under <a target="_blank" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>`,
      "-N",
      "Processed address points from the Utah UGRC SGID address points dataset for use in OSM",
      "-l",
      "addresses",
      "--drop-densest-as-needed",
      "--extend-zooms-if-still-dropping",
      "--force",
      "-x",
      "INTERNAL_COUNTY",
      "-x",
      "INTERNAL_MATCH_TYPE",
      ...missingAddressPointFiles,
    ],
    { cwd: OutputFolder },
  );

  child2.stdout.pipe(process.stdout);
  child2.stderr.pipe(process.stderr);

  await new Promise((resolve, reject) => {
    child2.on("close", (code) => (code ? reject(code) : resolve()));
  });

  // ensure that the files are written to the disk properly
  await setTimeout(5000);
}

if (isScriptInvokedDirectly(import.meta)) {
  createVectorTiles();
}
