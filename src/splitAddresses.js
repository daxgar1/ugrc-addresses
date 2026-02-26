import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { setTimeout } from "node:timers/promises";
import { spawn } from "node:child_process";
import {
  OsmCountyAddressFolder,
  UtahAddressFile,
  UtahCountyFile,
  isScriptInvokedDirectly,
} from "./const.js";

/**
 * Splits the main `.osm.pbf` file into separate `.osm.pbf` files for each county
 */
export async function splitAddressesByCounty() {
  const counties = JSON.parse(await fs.readFile(UtahCountyFile));

  try {
    await fs.rm(OsmCountyAddressFolder, { force: true, recursive: true });
  } catch (e) {}
  await fs.mkdir(OsmCountyAddressFolder, { recursive: true });

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];

    const child = spawn(
      "osmium",
      [
        "extract",
        "--polygon",
        county.geoJsonFile,
        "--strategy=smart",
        UtahAddressFile,
        "--overwrite",
        "-o",
        county.planetFile,
      ],
      { cwd: dirname("..") },
    );

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    await new Promise((resolve, reject) => {
      child.on("close", (code) => (code ? reject(code) : resolve()));
    });
  }

  // ensure that the files are written to the disk properly
  await setTimeout(5000);
}

if (isScriptInvokedDirectly(import.meta)) {
  splitAddressesByCounty();
}
