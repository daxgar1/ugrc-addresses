import { promises as fs } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  OutputFolder,
  MapRouletteDataFolder,
  isScriptInvokedDirectly,
} from "./const.js";

const countyFilePath = join(OutputFolder, "counties.json");

/**
 * Creates Tag Fix MapRoulette challenge files for partially-matched addresses in each County
 */
export async function createMapRouletteChallengeFiles() {
  const counties = JSON.parse(await fs.readFile(countyFilePath)).counties;

  try {
    await fs.rm(MapRouletteDataFolder, { force: true, recursive: true });
  } catch (e) {}
  await fs.mkdir(MapRouletteDataFolder, { recursive: true });

  for (const county of counties) {
    const inputFilePath = join(OutputFolder, county.partialPath);
    const inputGeoJson = JSON.parse(await fs.readFile(inputFilePath));

    const outputFilePath =
      join(MapRouletteDataFolder, county.name.replace(/\s+/g, "-")) +
      ".geo.json";

    const handle = await fs.open(outputFilePath, "w");

    for (const feature of inputGeoJson.features) {
      // Store the OSM feature's type and id
      const featId = `${feature.properties.INTERNAL_OSM_TYPE}/${feature.properties.INTERNAL_OSM_ID}`;

      // Create a template feature for MapRoulette's Tag Fix challenge type
      const processedFeature = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: featId,
            properties: {
              "@id": featId,
            },
            geometry: feature.geometry,
          },
        ],
        cooperativeWork: {
          meta: {
            version: 2,
            type: 1,
          },
          operations: [
            {
              operationType: "modifyElement",
              data: {
                id: featId,
                operations: [
                  {
                    operation: "setTags",
                    data: {},
                  },
                ],
              },
            },
          ],
        },
      };

      // Fill out the template feature with the keys that need to be updated
      for (const propertyName of Object.keys(feature.properties)) {
        if (!propertyName.startsWith("INTERNAL_OSM_")) {
          continue;
        }

        const propKey = `addr:${propertyName.substring(13).toLowerCase()}`;
        const propValue = feature.properties[propKey];

        if (propKey) {
          processedFeature.cooperativeWork.operations[0].data.operations[0].data[
            propKey
          ] = propValue;
        }
      }

      // Save each feature to the file on a separate line, starting each line with a RFC 7464 record separator (RS) character
      await handle.write(`\u001e${JSON.stringify(processedFeature)}\n`);
    }

    // Close the file stream
    await handle.close();
  }

  // ensure that the files are written to the disk properly
  await setTimeout(5000);
}

if (isScriptInvokedDirectly(import.meta)) {
  createMapRouletteChallengeFiles();
}
