import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as schedule from "node-schedule";
import { logger } from "./src/const.js";
import { DateTime } from "luxon";

import { downloadPlanetFile } from "./src/downloadPlanet.js";
import { extractPlanetAddresses } from "./src/extractPlanetAddresses.js";
import { downloadCountyBoundaries } from "./src/downloadCountyBoundaries.js";
import { downloadUgrcAddresses } from "./src/downloadUgrcAddresses.js";
import { splitAddressesByCounty } from "./src/splitAddresses.js";
import { conflate } from "./src/conflate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expire the cache 30 minutes after the generation process starts
function getNextCacheExpiration() {
  const now = DateTime.now().setZone("America/Denver");

  // Start with this week's Monday at 7:30 AM
  let next = now
    .startOf("week") // Monday in Luxon (ISO week)
    .plus({ days: 0 }) // Monday
    .set({ hour: 7, minute: 30, second: 0, millisecond: 0 });

  // If we're already past this week's Monday 7:30 AM, move to next week
  if (now >= next) {
    next = next.plus({ weeks: 1 });
  }

  return next.toUTC();
}

const app = express();
const PORT = process.env.PORT || 8000;

const outDir = path.resolve(__dirname, "./out");

app.use(
  "/data",
  express.static(outDir, {
    setHeaders: (res, path) => {
      if (process.env.NODE_ENV !== "production") return;

      const expires = getNextCacheExpiration();

      const maxAgeSeconds = Math.floor(expires.diffNow("seconds").seconds);

      res.setHeader("Expires", expires.toHTTP());
      res.setHeader(
        "Cache-Control",
        `public, must-revalidate, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
      );
    },
  }),
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "map.html"));
});

app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en-US">
      <head>
        <title>Error 404 - Not Found</title>
      </head
      <body>
        <h1>Error 404</h1>
        <p>The requested page was not found on the server.</p>
        <p><a href="/">Go back to the main page</a></p>
      </body>
    </html>
  `);
});

// Start the server before building anything
const server = app.listen(PORT, () => {
  if (process.env.NODE_ENV === "production") {
    logger.info(`server.js - Server running on port ${PORT}`);
  } else {
    logger.info(`server.js - Server running at http://localhost:${PORT}`);
  }
});

async function sendDiscordNotification(success, message, error = false) {
  const webhookUri = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUri) {
    return;
  }

  const color =
    success ?
      0x2ecc71 // green
    : 0xe74c3c; // red

  const statusText = success ? "SUCCESS" : "FAILURE";

  // Discord embed description limit is 4096 chars
  const safeMessage = message?.toString().slice(0, 3900);

  const fields = [
    {
      name: "Node Environment",
      value: process.env.NODE_ENV || "development",
      inline: true,
    },
  ];

  if (error) {
    fields.push({
      name: "Error",
      value: error?.toString() || error,
      inline: true,
    });
  }

  const payload = {
    username: "UGRC Addresses",
    embeds: [
      {
        title: `Scheduled Data Sync ${statusText}`,
        type: "rich",
        description: safeMessage,
        color,
        timestamp: new Date().toISOString(),
        fields,
      },
    ],
  };

  try {
    const response = await fetch(webhookUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error(
        "server.js - Discord notification failed:",
        await response.text(),
      );
    }
  } catch (err) {
    logger.error("server.js - Failed to send Discord notification:", err);
  }
}

async function scheduledSyncJob(fireTime, forceUgrcSync = false) {
  const start = Date.now();
  const isFirstMonday = fireTime.getDate() <= 7;

  let failureStep = "";

  try {
    // Sync UGRC data first, as the OSM data sync depends on some files that it creates
    if (isFirstMonday || forceUgrcSync) {
      logger.info(
        `server.js - ${new Date().toISOString()}: UGRC Data Sync Starting`,
      );

      failureStep = "UGRC Sync - downloadCountyBoundaries";
      await downloadCountyBoundaries();

      failureStep = "UGRC Sync - downloadUgrcAddresses";
      await downloadUgrcAddresses();

      logger.info(
        `server.js - ${new Date().toISOString()}: UGRC Data Sync Finished`,
      );
    }

    logger.info(
      `server.js - ${new Date().toISOString()}: OSM Data Sync Starting`,
    );

    failureStep = "OSM Sync - downloadPlanetFile";
    await downloadPlanetFile();

    failureStep = "OSM Sync - extractPlanetAddresses";
    await extractPlanetAddresses();

    failureStep = "OSM Sync - splitAddressesByCounty";
    await splitAddressesByCounty();

    logger.info(
      `server.js - ${new Date().toISOString()}: OSM Data Sync Finished`,
    );

    failureStep = "Conflation";
    await conflate();

    const duration = ((Date.now() - start) / 1000).toFixed(2);

    await sendDiscordNotification(
      true,
      `Data sync successfully completed in ${duration}s${
        isFirstMonday ? ", including UGRC data" : ""
      }`,
    );
  } catch (error) {
    logger.error(
      `server.js - Scheduled sync failed at step: ${failureStep}`,
      error,
    );

    const duration = ((Date.now() - start) / 1000).toFixed(2);

    await sendDiscordNotification(
      false,
      `Data sync failed at step: "${failureStep}"\nRan for ${duration}s before failing`,
      error,
    );
  }
}

if (process.env.SCHEDULE_SYNC) {
  // Schedule the update for every Monday at 7:00 AM Mountain Time
  const scheduleRule = new schedule.RecurrenceRule();
  scheduleRule.dayOfWeek = 1;
  scheduleRule.hour = 7;
  scheduleRule.minute = 0;
  scheduleRule.second = 0;
  scheduleRule.tz = "America/Denver";

  schedule.scheduleJob(scheduleRule, scheduledSyncJob);
}

if (process.env.INITIAL_SYNC) {
  // During the first start-up, sync everything
  await scheduledSyncJob(new Date(), true);
}

// Proper shutdown procedure
function shutdown() {
  // Stop the server first
  server.close(() => {
    // Then cancel any scheduled tasks
    schedule
      .gracefulShutdown()
      .then(() => {
        // And finally, close the log files
        logger.end(() => {
          process.exit(0);
        });
      })
      .catch((err) => {
        console.error("Error during schedule shutdown:", err);
        process.exit(1);
      });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("Shutdown taking too long - forcing exit");
    process.exit(1);
  }, 10000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
