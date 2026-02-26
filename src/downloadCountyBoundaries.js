import { Client } from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  logger,
  UtahCountyBoundaryFolder,
  OsmCountyAddressFolder,
  UtahCountyFile,
  UgrcPostgresConfig,
  isScriptInvokedDirectly,
} from "./const.js";

/**
 * Download the county boundaries from UGRC and save them as GeoJSON
 */
export async function downloadCountyBoundaries() {
  const counties = [];

  const client = new Client(UgrcPostgresConfig);

  await client.connect();

  try {
    await fs.rm(UtahCountyFile, { force: true });
    await fs.rm(UtahCountyBoundaryFolder, { force: true, recursive: true });
  } catch (e) {}
  await fs.mkdir(UtahCountyBoundaryFolder, { recursive: true });

  // Transform the UGRC county boundary data from EPSG:26912 to EPSG:4326, and return it in the GeoJSON format
  const query = `
    SELECT
      name,
      fips_str,
      ST_AsGeoJSON(
        ST_Transform(shape, 4326),
        6
      ) AS geojson
    FROM boundaries.county_boundaries
    ORDER BY name;
  `;

  const res = await client.query(query);

  for (const row of res.rows) {
    const feature = {
      type: "Feature",
      properties: {
        name: row.name,
        fips: row.fips_str,
      },
      geometry: JSON.parse(row.geojson),
    };

    const fc = {
      type: "FeatureCollection",
      features: [feature],
    };

    const safeName = row.name.replace(/\s+/g, "-");
    const filePath = path.join(UtahCountyBoundaryFolder, `${safeName}.geojson`);

    await fs.writeFile(filePath, JSON.stringify(fc), "utf8");

    counties.push({
      name: row.name,
      fips: row.fips_str,
      geoJsonFile: filePath,
      planetFile: path.join(OsmCountyAddressFolder, `${safeName}.osm.pbf`),
    });
  }

  await fs.writeFile(UtahCountyFile, JSON.stringify(counties), "utf8");

  // ensure that the files are written to the disk properly
  await setTimeout(5000);

  // logger.info(`downloadCountyBoundaries.js - ${UtahCountyFile}\r\n${await fs.stat(UtahCountyFile)}`);

  await client.end();
}

if (isScriptInvokedDirectly(import.meta)) {
  downloadCountyBoundaries();
}
