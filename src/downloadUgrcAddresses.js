import { Client } from "pg";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  UgrcPostgresConfig,
  UtahCountyFile,
  UgrcCountyAddressFolder,
  isScriptInvokedDirectly,
} from "./const.js";
import { normalizeAddress } from "./normalizeStateAddress.js";

/**
 * @typedef {{type: "Feature", geometry: {type: "Point", coordinates: number[]}, properties: object}} GeoJSONPoint
 * @typedef {{type: "FeatureCollection", features: GeoJSONPoint[]}} GeoJSONPointCollection
 */

/**
 * Load all of the UGRC address points from the UGRC PostGIS server for the county with the input FIPS code, and return them as processed GeoJSON
 * @param {string} fipsCode The FIPS code that is assigned to the county
 * @returns {Promise<GeoJSONPointCollection>} Processed UGRC address points as GeoJSON
 */
async function loadUgrcDataAsGeojson(fipsCode) {
  const client = new Client(UgrcPostgresConfig);
  await client.connect();

  const features = [];

  const query = `
    SELECT addnum, prefixdir, streetname, streettype,
      suffixdir, unitid, city, zipcode, state,
      ST_Y(ST_Transform(shape, 4326)) AS lat,
      ST_X(ST_Transform(shape, 4326)) AS lng
    FROM location.address_points
    WHERE countyid = $1;
  `;

  const res = (await client.query(query, [fipsCode]))?.rows;

  res.forEach((addressPoint) => {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [addressPoint.lng, addressPoint.lat],
      },
      properties: normalizeAddress(addressPoint),
    });
  });

  await client.end();

  return { type: "FeatureCollection", features };
}

export async function downloadUgrcAddresses() {
  /**
   * The list of counties to process
   * @type {{name: string, fips: string, geoJsonFile: string, planetFile: string}[]}
   */
  const counties = JSON.parse(await fs.readFile(UtahCountyFile));

  try {
    await fs.rm(UgrcCountyAddressFolder, { force: true, recursive: true });
  } catch (e) {}
  await fs.mkdir(UgrcCountyAddressFolder, { recursive: true });

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];

    const filePath = join(
      UgrcCountyAddressFolder,
      `${county.name.replace(/\s+/g, "-")}.geojson`,
    );

    console.time(`Downloaded addresses for ${county.name} in`);

    const geoData = await loadUgrcDataAsGeojson(county.fips);

    console.timeEnd(`Downloaded addresses for ${county.name} in`);

    await fs.writeFile(filePath, JSON.stringify(geoData), "utf8");
  }

  // ensure that the files are written to the disk properly
  await setTimeout(5000);
}

if (isScriptInvokedDirectly(import.meta)) {
  downloadUgrcAddresses();
}
