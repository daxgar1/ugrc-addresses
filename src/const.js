import * as winston from "winston";
import "winston-daily-rotate-file";

const rotatedExceptionTransport = new winston.transports.DailyRotateFile({
  filename: "logs/exceptions-%DATE%.log",
  datePattern: "YYYY-MM-DD-HH",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "42d",
});
rotatedExceptionTransport.on("error", (error) => {
  console.error("Error in Exceptions log:", error);
});

const rotatedErrorTransport = new winston.transports.DailyRotateFile({
  level: "error",
  filename: "logs/error-%DATE%.log",
  datePattern: "YYYY-MM-DD-HH",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "42d",
});
rotatedErrorTransport.on("error", (error) => {
  console.error("Error in Error log:", error);
});

const rotatedCombinedTransport = new winston.transports.DailyRotateFile({
  level: "info",
  filename: "logs/combined-%DATE%.log",
  datePattern: "YYYY-MM-DD-HH",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
});
rotatedCombinedTransport.on("error", (error) => {
  console.error("Error in Combined log:", error);
});

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json(),
  ),
  defaultMeta: { serverStartTime: new Date().toISOString() },
  transports: [rotatedErrorTransport, rotatedCombinedTransport],
  exceptionHandlers: [rotatedExceptionTransport],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

export const PlanetDownloadServer = "https://download.geofabrik.de";
export const PlanetDownloadFile = "/north-america/us/utah-latest.osm.pbf";
export const UtahPlanetFile = "./data/utah.osm.pbf";

export const UtahAddressFile = "./data/utah-addresses.osm.pbf";

// See https://github.com/agrc/open-sgid
export const UgrcPostgresConfig = {
  connectionString: process.env.PG_CONNECTION_STRING,
};

export const UtahCountyBoundaryFolder = "./data/ugrc-county-boundaries";
export const OsmCountyAddressFolder = "./data/osm-county-addresses";
export const UgrcCountyAddressFolder = "./data/ugrc-county-addresses";
export const UtahCountyFile = "./data/utah-counties.json";

export const OutputFolder = "./out";
export const MapRouletteDataFolder = "./out/maproulette";
export const VectorTileFileName = "addresses.pmtiles";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";

/**
 * Determine if a script file was ran directly or imported. See https://blog.infra.kiwi/checking-if-the-current-script-has-been-imported-or-has-been-invoked-directly-56417e6f422b
 * @param {ImportMeta} meta Always set to `import.meta`
 * @returns {boolean} True if this script was directly invoked
 */
export function isScriptInvokedDirectly(meta) {
  if (meta == null || process.argv[1] == null) {
    return false;
  }

  const scriptPath = createRequire(meta.url).resolve(process.argv[1]);
  const modulePath = fileURLToPath(meta.url);
  return extname(scriptPath) ?
      modulePath == scriptPath
      // Compare without extensions, because Node.js supports invoking
      // scripts without extension
    : modulePath.replace(/\.[^.]+$/, "") == scriptPath;
}
