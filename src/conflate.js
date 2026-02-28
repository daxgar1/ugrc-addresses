import { promises as fs, createReadStream } from "node:fs";
import { join, basename } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  logger,
  UtahCountyFile,
  UgrcCountyAddressFolder,
  OutputFolder,
  isScriptInvokedDirectly,
} from "./const.js";
import osmPbfParser from "osm-pbf-parser";
import through2 from "through2";
import RBush from "rbush";
import { getDirNames, getStreetTypeNames } from "./normalizeStateAddress.js";
import { point } from "@turf/helpers";
import distance from "@turf/distance";

/**
 * @typedef {{type: "Feature", geometry: {type: "Point", coordinates: number[]}, properties: object}} GeoJSONPoint
 * @typedef {{type: "FeatureCollection", features: GeoJSONPoint[]}} GeoJSONPointCollection
 */

const geoFileExt = ".geo.json";

/**
 * Should a file containing the full addresses should be created
 */
const createFullAddressFile =
  process.env.CREATE_FULL_ADDRESS_FILE ? true : false;

/**
 * Takes an object containing OSM tags and returns a new object containing only the values where the key starts with `addr:`
 * @param {object} tags
 * @returns {object} An object with just the `addr:*` tags
 */
function filterAddrTags(tags) {
  const filtered = {};
  for (const key in tags) {
    if (key.startsWith("addr:")) {
      filtered[key] = tags[key];
    }
  }
  return filtered;
}

/**
 * Takes a set of coordinates and returns the centroid of them
 * @param {{lon: number, lat: number}[]} coords
 * @returns {number[]} The centroid position `[lon, lat]`
 */
function computeCentroid(coords) {
  const n = coords.length;
  let sumLon = 0,
    sumLat = 0;
  coords.forEach(({ lon, lat }) => {
    sumLon += lon;
    sumLat += lat;
  });
  return [sumLon / n, sumLat / n];
}

/**
 * Reads an `.osm.pbf` file and returns GeoJSON with points for each feature in the file, with only the OSM tags starting with `addr:`
 * @param {string} pbfFile File name of the PBF file to process
 * @returns {Promise<GeoJSONPointCollection>} The GeoJSON Point features from the file
 */
function processPbf(pbfFile) {
  return new Promise((resolve) => {
    const features = [];

    // Create parser stream
    const parser = osmPbfParser();

    const nodeLookup = new Map();
    const wayLookup = new Map();

    // Pipe file into it
    createReadStream(pbfFile)
      .pipe(parser)
      .pipe(
        through2.obj(function (batch, _, next) {
          batch.forEach((item) => {
            if (item.type === "node") {
              // Save node coordinates for later use in ways/relations
              nodeLookup.set(item.id, item);
            } else if (item.type === "way") {
              // Save way coordinates for later use in relations
              wayLookup.set(item.id, item);
            }

            const addrTags = filterAddrTags(item.tags || {});
            if (Object.keys(addrTags).length === 0) return;

            if (item.type === "node") {
              features.push({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [item.lon, item.lat],
                },
                properties: {
                  ...addrTags,
                  OSM_TYPE: "node",
                  OSM_ID: item.id,
                },
              });
            } else if (item.type === "way") {
              if (item.refs && item.refs.length) {
                const coords = item.refs
                  .map((nodeId) => nodeLookup.get(nodeId))
                  .filter((c) => c); // skip missing nodes
                const centroid = computeCentroid(coords);
                features.push({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: centroid },
                  properties: {
                    ...addrTags,
                    OSM_TYPE: "way",
                    OSM_ID: item.id,
                  },
                });
              }
            } else if (item.type === "relation") {
              const coords = [];

              item.members.forEach((m) => {
                if (m.type === "node") {
                  const c = nodeLookup.get(m.id);
                  if (c) coords.push(c);
                } else if (m.type === "way") {
                  const w = wayLookup.get(m.id);
                  if (w) {
                    w.refs.forEach((nodeId) => {
                      const c = nodeLookup.get(nodeId);
                      if (c) coords.push(c);
                    });
                  }
                }
                // Ignoring relations-of-relations for simplicity
              });
              if (coords.length > 0) {
                const centroid = computeCentroid(coords);
                features.push({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: centroid },
                  properties: {
                    ...addrTags,
                    OSM_TYPE: "relation",
                    OSM_ID: item.id,
                  },
                });
              }
            } else {
              logger.info(
                "conflate.js - Unknown item type: ",
                item?.type,
                item,
              );
            }
          });

          next();
        }),
      )
      .on("finish", () => {
        const geojson = { type: "FeatureCollection", features };
        resolve(geojson);
      });
  });
}

/**
 * Normalize tag values for comparison
 * @param {string} value A string to normalize
 * @returns {string} A normalized version of the input string that is easier to compare
 */
function normalize(value) {
  return (value || "") // Always make sure there is a value
    .toString() // Make sure it is a string
    .trim() // Remove beginning and ending whitespace
    .toLowerCase(); // Make sure everything is lowercase
}

const streetPrefixRegex = new RegExp(`^(${getDirNames().join("|")}) `);
const streetTypeRegex = new RegExp(` (${getStreetTypeNames().join("|")})$`);
const spaceRegex = /\s+/g;

/**
 * Compare a UGRC value with an OSM value to determine if they match
 * @param {string} ugrcVal The value from UGRC
 * @param {string} osmVal The value from OSM
 * @param {"HOUSENUMBER"|"STREET"|"CITY"|"POSTCODE"|"UNIT"} [type=""] The type data to compare
 * @returns {false|"PARTIAL"|"FULL"} The result of the comparison
 */
function compare(ugrcVal, osmVal, type = "") {
  let ugrcNormal = normalize(ugrcVal);
  let osmNormal = normalize(osmVal);

  let ugrcSpaceless = ugrcNormal.replace(spaceRegex, "");
  let osmSpaceless = osmNormal.replace(spaceRegex, "");

  if (ugrcSpaceless === osmSpaceless) {
    return "FULL";
  }

  if (type === "HOUSENUMBER") {
    // Support multiple house numbers in a single OSM address
    // House numbers can be separated with either a `,` or a `;`
    const houseNumbers = osmNormal.split(/;|,/);

    for (const houseNumber of houseNumbers) {
      if (ugrcSpaceless === houseNumber.replace(spaceRegex, "")) {
        return "FULL";
      }
    }
  } else if (type === "STREET") {
    // Remove a prefix direction if it exists at the start of the OSM street name
    osmNormal = osmNormal.replace(streetPrefixRegex, "");

    // If the OSM data has a prefix direction and the authoritative data does not, assume that the OSM data is correct
    if (
      ugrcNormal.replace(spaceRegex, "") === osmNormal.replace(spaceRegex, "")
    ) {
      return "FULL";
    }

    // Remove a prefix direction if it exists at the start of the authoritative street name
    ugrcNormal = ugrcNormal.replace(streetPrefixRegex, "");

    // Remove a street type if it exists at the end of either street name
    ugrcNormal = ugrcNormal.replace(streetTypeRegex, "");
    osmNormal = osmNormal.replace(streetTypeRegex, "");

    // Remove spaces and compare
    if (
      ugrcNormal.replace(spaceRegex, "") === osmNormal.replace(spaceRegex, "")
    ) {
      return "PARTIAL";
    }
  } else if (type === "CITY") {
    if (!ugrcVal && osmVal) {
      // OSM uses address cities, while UGRC uses municipal cities
      return "FULL";
    }

    // Remove "city" if it exists at the end of the city name
    ugrcSpaceless = ugrcNormal.replace(/ city$/, "").replace(spaceRegex, "");
    osmSpaceless = osmNormal.replace(/ city$/, "").replace(spaceRegex, "");

    if (ugrcSpaceless === osmSpaceless) {
      return "PARTIAL";
    }
  } else if (type === "UNIT") {
    if (!ugrcVal && !osmVal) {
      return "FULL";
    } else if (!ugrcVal && osmVal) {
      // Allow for an OSM address with a unit number to match a UGRC address without one
      return "FULL";
    }

    // Support multiple units and unit ranges in OSM addresses
    const unitNumbers = osmNormal
      // Split into sections
      .split(/;|,/)
      // Expand ranges
      .map((unitNumber) => {
        const range = unitNumber.split("-");
        if (range.length !== 2 || !Number(range[0]) || !Number(range[1])) {
          return unitNumber;
        }

        // Convert to numbers and find out which is the lower part of the range
        const rawFirst = Math.floor(Number(range[0])),
          rawSecond = Math.floor(Number(range[1]));
        const start = Math.min(rawFirst, rawSecond);
        const end = Math.max(rawFirst, rawSecond);

        // Expand the range
        let inRange = [];
        for (let i = start; i <= end; i++) {
          inRange.push(i.toString());
        }

        return inRange;
      })
      // Collapse ranges into the base array
      .flat();

    for (const unitNumber of unitNumbers) {
      if (ugrcSpaceless === unitNumber.replace(spaceRegex, "")) {
        return "FULL";
      }
    }
  } else if (type === "POSTCODE") {
    // OSM data could contain the full ZIP+4 Code, where the UGRC data only contains the 5-digit ZIP Code
    if (ugrcSpaceless === osmSpaceless.substring(0, 5)) {
      return "FULL";
    }
  }

  return false;
}

/**
 * Build an RBush spatial index from the OSM data
 * @param {object} osmGeo GeoJSON object containing OSM address points
 */
function buildSpatialIndex(osmGeo) {
  const tree = new RBush();

  const items = osmGeo.features.map((feature, i) => {
    const [lon, lat] = feature.geometry.coordinates;
    return {
      minX: lon,
      minY: lat,
      maxX: lon,
      maxY: lat,
      index: i,
    };
  });

  tree.load(items);
  return tree;
}

/**
 * Conflate UGRC and OSM address data for a single county
 * @param {{name: string, fips: string, geoJsonFile: string, planetFile: string}} county The county to conflate addresses for
 * @param {string} outputFile The file name for the conflated GeoJSON data file
 * @returns {{missing: {filePath: string, count: number}, partial: {filePath: string, count: number}, full: {filePath: string, count: number}}} Data about the conflation
 */
async function conflateCounty(county, outputFile) {
  /**
   * OSM data in GeoJSON format
   * @type {GeoJSONPointCollection}
   */
  const osmGeo = await processPbf(county.planetFile);
  /**
   * UGRC data in GeoJSON format
   * @type {GeoJSONPointCollection}
   */
  const stateGeo = JSON.parse(
    await fs.readFile(
      join(
        UgrcCountyAddressFolder,
        `${county.name.replace(spaceRegex, "-")}.geojson`,
      ),
    ),
  );

  /** Spatially-indexed tree of OSM data */
  const tree = buildSpatialIndex(osmGeo);

  /**
   * UGRC address points that don't exist in OSM
   * @type {GeoJSONPoint}
   */
  const missingFeatures = [];
  /**
   * UGRC address points that exist in OSM, but don't perfectly match
   * @type {GeoJSONPoint}
   */
  const partialFeatures = [];
  /**
   * UGRC address points that exist in OSM and perfectly match
   * @type {GeoJSONPoint}
   */
  const fullFeatures = [];

  stateGeo.features.forEach((ugrcFeature) => {
    const [lon, lat] = ugrcFeature.geometry.coordinates;
    const ugrcProps = ugrcFeature.properties;

    const ugrcPoint = point([lon, lat]);

    // Approx 100m bounding box to limit the number of OSM addresses to loop over
    const bbox = {
      minX: lon - 0.002,
      minY: lat - 0.002,
      maxX: lon + 0.002,
      maxY: lat + 0.002,
    };

    const nearby = tree.search(bbox);

    let matchType = "MISSING";
    //TODO: edit the code so `foundPartial` can be removed in favor of checking `matchType`
    let foundPartial = false;
    let bestInternalProps = {};

    for (const item of nearby) {
      const osmFeature = osmGeo.features[item.index];
      const osmProps = osmFeature.properties;

      const osmPoint = point(osmFeature.geometry.coordinates);
      const featureDistance = distance(ugrcPoint, osmPoint, {
        units: "meters",
      });

      // If this OSM element is more than 100 meters aways from the UGRC address point, skip it and keep looking for a match
      if (featureDistance > 100) continue;

      // Figure out how much of the address matches
      const housenumberMatch = compare(
        ugrcProps["addr:housenumber"],
        osmProps["addr:housenumber"],
        "HOUSENUMBER",
      );
      const streetMatch = compare(
        ugrcProps["addr:street"],
        osmProps["addr:street"],
        "STREET",
      );
      const postcodeMatch = compare(
        ugrcProps["addr:postcode"],
        osmProps["addr:postcode"],
        "POSTCODE",
      );
      const cityMatch = compare(
        ugrcProps["addr:city"],
        osmProps["addr:city"],
        "CITY",
      );
      const unitMatch = compare(
        ugrcProps["addr:unit"],
        osmProps["addr:unit"],
        "UNIT",
      );

      if (housenumberMatch && streetMatch && unitMatch) {
        // If the house number and street name match, then this is at least a partial match.
        // Also require the unit to match to prevent multiple partial address points from using the same OSM element
        foundPartial = true;
        let internalProps = {};

        internalProps.INTERNAL_OSM_TYPE = osmProps.OSM_TYPE;
        internalProps.INTERNAL_OSM_ID = osmProps.OSM_ID;

        // Store the OSM value of any properties that do not fully match the authoritative data in a partial match
        if (housenumberMatch !== "FULL") {
          internalProps.INTERNAL_OSM_HOUSENUMBER =
            osmProps["addr:housenumber"] || "(NONE)";
        }
        if (streetMatch !== "FULL") {
          internalProps.INTERNAL_OSM_STREET =
            osmProps["addr:street"] || "(NONE)";
        }
        if (cityMatch !== "FULL") {
          internalProps.INTERNAL_OSM_CITY = osmProps["addr:city"] || "(NONE)";
        }
        if (postcodeMatch !== "FULL") {
          internalProps.INTERNAL_OSM_POSTCODE =
            osmProps["addr:postcode"] || "(NONE)";
        }
        if (unitMatch !== "FULL") {
          internalProps.INTERNAL_OSM_UNIT = osmProps["addr:unit"] || "(NONE)";
        }

        if (cityMatch && postcodeMatch) {
          // If the city and ZIP code also match, then this is a full match
          let newMatchType =
            (
              [
                housenumberMatch,
                streetMatch,
                cityMatch,
                postcodeMatch,
              ].includes("PARTIAL")
            ) ?
              "PARTIAL"
            : "FULL";
          if (matchType === "FULL" && newMatchType === "PARTIAL") {
            // Not a better match, so keep looking
            continue;
          }

          // A better match then before, so update the saved OSM information
          matchType = newMatchType;
          bestInternalProps = internalProps;

          if (matchType === "FULL") {
            break; // If this is a full match, then stop looking for something better
          }
        } else if (matchType === "MISSING") {
          bestInternalProps = internalProps;
        }
      }
    }

    if (matchType !== "FULL" && foundPartial) {
      matchType = "PARTIAL";
    }

    const feat = {
      type: "Feature",
      geometry: {
        ...ugrcFeature.geometry,
        coordinates: ugrcFeature.geometry.coordinates.map(
          (coord) => coord.toFixed(6), // Decrease the coordinate precision to decrease client-side processing
        ),
      },
      properties: {
        ...ugrcProps,
        INTERNAL_MATCH_TYPE: matchType,
        ...bestInternalProps,
      },
    };

    if (matchType === "FULL") {
      fullFeatures.push(feat);
    } else if (matchType === "PARTIAL") {
      partialFeatures.push(feat);
    } else {
      missingFeatures.push(feat);
    }
  });

  /** @type {GeoJSONPointCollection} */
  const missingOutputGeo = {
    type: "FeatureCollection",
    features: missingFeatures,
  };

  /** @type {GeoJSONPointCollection} */
  const partialOutputGeo = {
    type: "FeatureCollection",
    features: partialFeatures,
  };

  /** @type {GeoJSONPointCollection} */
  const fullOutputGeo = {
    type: "FeatureCollection",
    features: fullFeatures,
  };

  const missingOutFile = outputFile + "-missing" + geoFileExt;
  const partialOutFile = outputFile + "-partial" + geoFileExt;
  const fullOutFile = outputFile + "-full" + geoFileExt;

  await fs.writeFile(missingOutFile, JSON.stringify(missingOutputGeo), "utf8");
  await fs.writeFile(partialOutFile, JSON.stringify(partialOutputGeo), "utf8");
  if (createFullAddressFile) {
    await fs.writeFile(fullOutFile, JSON.stringify(fullOutputGeo), "utf8");
  }

  return {
    missing: {
      filePath: missingOutFile,
      count: missingFeatures.length,
    },
    partial: {
      filePath: partialOutFile,
      count: partialFeatures.length,
    },
    full: {
      filePath: fullOutFile,
      count: fullFeatures.length,
    },
  };
}

export async function conflate() {
  /**
   * The list of counties to process
   * @type {{name: string, fips: string, geoJsonFile: string, planetFile: string}[]}
   */
  const counties = JSON.parse(await fs.readFile(UtahCountyFile));

  try {
    await fs.rm(OutputFolder, { force: true, recursive: true });
  } catch (e) {}
  await fs.mkdir(OutputFolder, { recursive: true });

  /**
   * @type {{name: string, missingPath: string ,partialPath: string}[]}
   */
  const outCounties = [];

  const fullStats = {
    full: 0,
    partial: 0,
    missing: 0,
  };

  console.time(`Conflated all in`);

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];

    console.time(`Conflated ${county.name} in`);

    const filePath = join(OutputFolder, county.name.replace(spaceRegex, "-"));

    const stats = await conflateCounty(county, filePath);

    const countyListEntry = {
      name: county.name,
      missingPath: basename(stats.missing.filePath),
      partialPath: basename(stats.partial.filePath),
    };

    if (createFullAddressFile) {
      countyListEntry.fullPath = stats.full.filePath;
    }

    outCounties.push(countyListEntry);

    console.timeEnd(`Conflated ${county.name} in`);

    logger.info(
      `conflate.js - ${stats.full.count} Full Addresses${createFullAddressFile ? `` : ` - not written to disk`}`,
    );
    logger.info(`conflate.js - ${stats.partial.count} Partial Addresses`);
    logger.info(`conflate.js - ${stats.missing.count} Missing Addresses\r\n`);

    fullStats.full += stats.full.count;
    fullStats.partial += stats.partial.count;
    fullStats.missing += stats.missing.count;
  }

  console.timeEnd(`Conflated all in`);

  logger.info(
    `conflate.js - ${fullStats.full} Full Addresses${createFullAddressFile ? `` : ` - not written to disk`}`,
  );
  logger.info(`conflate.js - ${fullStats.partial} Partial Addresses`);
  logger.info(`conflate.js - ${fullStats.missing} Missing Addresses\r\n`);

  logger.info("conflate.js - Saving counties file...");

  const countyFilePath = join(OutputFolder, "counties.json");
  await fs.writeFile(
    countyFilePath,
    JSON.stringify({ created: new Date().getTime(), counties: outCounties }),
    "utf8",
  );

  // ensure that the files are written to the disk properly
  await setTimeout(5000);

  logger.info("conflate.js - Counties file saved\r\n");

  // logger.info(`conflate.js - ${countyFilePath}\r\n${await fs.stat(countyFilePath)}`);
}

if (isScriptInvokedDirectly(import.meta)) {
  conflate();
}
