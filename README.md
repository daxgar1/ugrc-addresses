# ugrc-addresses

A tool for evaluating the completeness of
[OpenStreetMap](https://www.openstreetmap.org/) address data, as compared to
data from the [Utah UGRC](https://gis.utah.gov/)
[Address Points dataset](https://gis.utah.gov/products/sgid/location/address-points/).

This project is designed to help OSM contributors easily identify UGRC addresses
that are missing from OSM and OSM addresses that are incorrect or incomplete
according to the UGRC data. This data is not guaranteed to be accurate.

You can view the data at
[https://ugrc-addresses.daxgardev.com](https://ugrc-addresses.daxgardev.com).
This data is updated weekly.

This tool is intended to help with manually reviewing and editing OSM data. It
should not be used for automated mass imports into OpenStreetMap.

# Overview

At a high level, this is how the data processing works:

1. Download Utah county boundaries from UGRC.
2. Download UGRC address points.
3. Download the
   [GeoFabrik OSM extract for Utah](https://download.geofabrik.de/north-america/us/utah.html).
4. Extract OSM elements from the GeoFabrik extract that contain `addr:*` tags.
5. Split the OSM addresses into separate files for each county.
6. Conflate the UGRC and OSM addresses to determine what addresses are missing
   or incomplete.

After the addresses have been conflated, they can be viewed by running the
Express server.

# Data Sources

This project uses the data from the following sources:

## OpenStreetMap

Utah extract from GeoFabrik:
https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf

Licensed under the Open Database License (ODbL):
https://www.openstreetmap.org/copyright

## Utah Geospatial Resource Center

Address Points dataset

Data accessed via the public SGID PostGIS server

PostGIS server details available at: https://github.com/agrc/open-sgid

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):
https://gis.utah.gov/documentation/policy/license/

# Data Size

As of February 2026, 550 MB of data is downloaded or created before the
conflation process, and the conflated data is about 300 MB.

# Conflation

The conflation process works as follows:

1. Each UGRC address point is checked for a matching OSM address within 100
   meters, on a per-county basis. The compared fields are `addr:unit`,
   `addr:housenumber`, `addr:street`, `addr:city`, and `addr:postcode`.
   - If everything fully matches, it is considered a full match.
   - If the `addr:housenumber` and `addr:street` partially or fully match, and
     one of the other fields does not fully match, it is considered a partial
     match.
   - If the `addr:housenumber` and `addr:street` do not match, it is considered
     missing.
2. Missing and partial matches are always output to files, but full matches are
   only output if the `CREATE_FULL_ADDRESS_FILE` environment variable is set.

# Output Data Format

Conflated data is output as GeoJSON FeatureCollection files containing Point
features.

The final output files follow this naming convention:
`(COUNTY-NAME)-(missing|partial|full).geo.json`

For example, if the full address file is written, Salt Lake County data would be
output in these files:

- `SALT-LAKE-missing.geo.json`
- `SALT-LAKE-partial.geo.json`
- `SALT-LAKE-full.geo.json`

County names are normalized by converting them to uppercase and replacing spaces
with hyphens (-).

## GeoJSON Properties

The following properties can be present on address points in the GeoJSON:

- `addr:unit`: The unit number from UGRC.
- `addr:housenumber`: The house number from UGRC.
- `addr:street`: The street name from UGRC.
- `addr:city`: The city name from UGRC.
- `addr:postcode`: The ZIP code from UGRC.
- `addr:state`: The two-letter state code `UT`.

- `INTERNAL_MATCH_TYPE`: The match type of the address point. Can be `MISSING`,
  `PARTIAL`, or `FULL`.

When `INTERNAL_MATCH_TYPE` is `PARTIAL` or `FULL`, the following properties may
be set:

- `INTERNAL_OSM_TYPE`: The type of element in OSM that the address tags are on.
  Can be `node`, `way`, or `relation`.
- `INTERNAL_OSM_ID`: The OSM ID of the element that the address tags are on.

- `INTERNAL_OSM_UNIT`: The value of `addr:unit` in OSM. This property is only
  present if it differs from the UGRC value.
- `INTERNAL_OSM_HOUSENUMBER`: The value of `addr:housenumber` in OSM. This
  property is only present if it differs from the UGRC value.
- `INTERNAL_OSM_STREET`: The value of `addr:street` in OSM. This property is
  only present if it differs from the UGRC value.
- `INTERNAL_OSM_CITY`: The value of `addr:city` in OSM. This property is only
  present if it differs from the UGRC value.
- `INTERNAL_OSM_POSTCODE`: The value of `addr:postcode` in OSM. This property is
  only present if it differs from the UGRC value.

# Server

Running the node server file (`npm run start`) will serve the map interface and
the data. The default port is `8000`, but this can be overridden by setting the
`PORT` environment variable to a different port number.

If the `INITIAL_SYNC` environment variable is set, the server will automatically
download and conflate the OSM and UGRC data when it first starts.

## Automatic Data Updates

If the `SCHEDULE_SYNC` environment variable is set, the server automatically
downloads and conflates the data every Monday at 7:00 AM Mountain Time. OSM data
is updated weekly on Monday, and UGRC data is updated monthly on the first
Monday of the month.

## Discord Integration

If the `DISCORD_WEBHOOK_URL` environment variable is set to a valid Discord
message webhook, the server will send a Discord message containing the status of
the sync each time the data sync process finishes. To create a Discord webhook
URL, follow the steps at
https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks.

# Installation

## Requirements

- Node.js V18 or higher (latest LTS version recommended)
- osmium-tool
- curl

## Install dependencies:

- `npm install`

## Process the data

To download and process the address data, run these commands:

**IMPORTANT**: the environment variable `PG_CONNECTION_STRING` must be set to
the UGRC PostGIS server authentication string, following the format
`postgres://user:password@host:5432/database` with the connection information
found at https://github.com/agrc/open-sgid

- `npm run download-county-boundaries`: Downloads the county boundaries from
  UGRC
- `npm run download-ugrc-addresses`: Downloads and processes the address points
  from UGRC, on a per-county basis
- `npm run download-planet`: Downloads the Utah OSM planet extract from
  GeoFabrik
- `npm run extract-planet-addresses`: Extracts just the OSM elements that have
  `addr:*` tags set from the Utah extract
- `npm run split-addresses-by-county`: Splits the OSM addresses file into
  separate files for each county, using the county boundaries from UGRC
- `npm run conflate`: Conflates the UGRC and OSM data on a per-county basis

## Start the server:

- `npm start`

# Docker

The project can be run entirely in Docker.

## Build

- `docker build -t ugrc-addresses .`

## Run

```sh
docker run \
  -p 8000:8000 \
  -e PG_CONNECTION_STRING=postgres://user:password@host:5432/database \
  -e INITIAL_SYNC=true \
  -e DISCORD_WEBHOOK_URL=your_webhook_url \
  -v ./data:/usr/local/ugrc-addresses/data \
  -v ./out:/usr/local/ugrc-addresses/out \
  ugrc-addresses
```

## Run with Docker Compose

```yml
version: "3.9"

services:
  ugrc-addresses:
    build: .
    ports:
      - "8000:8000"
    environment:
      - INITIAL_SYNC=true
      - DISCORD_WEBHOOK_URL=your_webhook_url
      - PG_CONNECTION_STRING=postgres://user:password@host:5432/database
    volumes:
      - ./data:/usr/local/ugrc-addresses/data
      - ./out:/usr/local/ugrc-addresses/out
```

# Known Limitations

- The UGRC data may contain typos, duplicate addresses, or multiple addresses
  for the same building, so the conflated data cannot be confirmed to be 100%
  correct.

# License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Data Licensing

The data used in this project is used within the terms of their respective
licenses.

- UGRC data is licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- OpenStreetMap data is licensed under
  [ODbL](https://www.openstreetmap.org/copyright).

Since the conflated data is composed of data from these sources, it inherits the
licenses of the source data.

Users of this data or the conflated data are responsible for complying with the
licenses of the source data.

This project is not endorsed by or affiliated with the OpenStreetMap Foundation
or the Utah Geospatial Resource Center.
