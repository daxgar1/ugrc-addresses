// The code in this file is heavily based on the address conversion script used in the https://wiki.openstreetmap.org/wiki/Utah/UtahBuildingsImport import
// See https://gitlab.com/NeedleInAJayStack/osm-utah-buildings-import/-/blob/master/UtahBuildingsImport_Addresses.js?ref_type=heads
// Thanks to NeedleInAJayStack

function capitalize(inputString) {
  if (!inputString) return "";
  const lowerString = inputString.toLowerCase();
  let capString = "";

  const words = lowerString.split(" ");
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const firstLetter = word.substr(0, 1).toUpperCase();
    const capWord = firstLetter.concat(word.substr(1)); // Replace first letter with captialization
    capString = capString.concat(" ").concat(capWord);
  }
  return capString.trim(); // Remove leading space
}

/** Converts direction abbreviations to direction names. */
const dirMap = {
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
};
function getDirName(dirAbbr) {
  const dirName = dirMap[dirAbbr];
  if (dirName === undefined)
    throw new Error('Direction mapping not found: "' + dirAbbr + '"');
  return capitalize(dirName);
}
export function getDirNames() {
  return Object.values(dirMap).map((item) => item.toLowerCase());
}

/** Converts street type abbreviations to street type names.
 * This is the USPS Street suffix abbreviation map, created from here: https://pe.usps.com/text/pub28/28apc_002.htm
 */
const streetTypeMap = {
  ALY: "ALLEY",
  ANX: "ANEX",
  ARC: "ARCADE",
  AVE: "AVENUE",
  BAY: "BAY",
  BYU: "BAYOU",
  BCH: "BEACH",
  BND: "BEND",
  BLF: "BLUFF",
  BLFS: "BLUFFS",
  BTM: "BOTTOM",
  BLVD: "BOULEVARD",
  BR: "BRANCH",
  BRG: "BRIDGE",
  BRK: "BROOK",
  BRKS: "BROOKS",
  BG: "BURG",
  BGS: "BURGS",
  BYP: "BYPASS",
  CP: "CAMP",
  CYN: "CANYON",
  CPE: "CAPE",
  CSWY: "CAUSEWAY",
  CTR: "CENTER",
  CTRS: "CENTERS",
  CIR: "CIRCLE",
  CIRS: "CIRCLES",
  CLF: "CLIFF",
  CLFS: "CLIFFS",
  CLB: "CLUB",
  CMN: "COMMON",
  CMNS: "COMMONS",
  COR: "CORNER",
  CORS: "CORNERS",
  CRSE: "COURSE",
  CT: "COURT",
  CTS: "COURTS",
  CV: "COVE",
  CVS: "COVES",
  CRK: "CREEK",
  CRES: "CRESCENT",
  CRST: "CREST",
  XING: "CROSSING",
  XRD: "CROSSROAD",
  XRDS: "CROSSROADS",
  CURV: "CURVE",
  DL: "DALE",
  DM: "DAM",
  DV: "DIVIDE",
  DR: "DRIVE",
  DRS: "DRIVES",
  EST: "ESTATE",
  ESTS: "ESTATES",
  EXPY: "EXPRESSWAY",
  EXT: "EXTENSION",
  EXTS: "EXTENSIONS",
  FALL: "FALL",
  FLS: "FALLS",
  FRY: "FERRY",
  FLD: "FIELD",
  FLDS: "FIELDS",
  FLT: "FLAT",
  FLTS: "FLATS",
  FRD: "FORD",
  FRDS: "FORDS",
  FRST: "FOREST",
  FRG: "FORGE",
  FRGS: "FORGES",
  FRK: "FORK",
  FRKS: "FORKS",
  FT: "FORT",
  FWY: "FREEWAY",
  GDN: "GARDEN",
  GDNS: "GARDENS",
  GTWY: "GATEWAY",
  GLN: "GLEN",
  GLNS: "GLENS",
  GRN: "GREEN",
  GRNS: "GREENS",
  GRV: "GROVE",
  GRVS: "GROVES",
  HBR: "HARBOR",
  HBRS: "HARBORS",
  HVN: "HAVEN",
  HTS: "HEIGHTS",
  HWY: "HIGHWAY",
  HL: "HILL",
  HLS: "HILLS",
  HOLW: "HOLLOW",
  INLT: "INLET",
  IS: "ISLAND",
  ISS: "ISLANDS",
  ISLE: "ISLE",
  JCT: "JUNCTION",
  JCTS: "JUNCTIONS",
  KY: "KEY",
  KYS: "KEYS",
  KNL: "KNOLL",
  KNLS: "KNOLLS",
  LK: "LAKE",
  LKS: "LAKES",
  LAND: "LAND",
  LNDG: "LANDING",
  LN: "LANE",
  LGT: "LIGHT",
  LGTS: "LIGHTS",
  LF: "LOAF",
  LCK: "LOCK",
  LCKS: "LOCKS",
  LDG: "LODGE",
  LOOP: "LOOP",
  MALL: "MALL",
  MNR: "MANOR",
  MNRS: "MANORS",
  MDW: "MEADOW",
  MDWS: "MEADOWS",
  MEWS: "MEWS",
  ML: "MILL",
  MLS: "MILLS",
  MSN: "MISSION",
  MTWY: "MOTORWAY",
  MT: "MOUNT",
  MTN: "MOUNTAIN",
  MTNS: "MOUNTAINS",
  NCK: "NECK",
  ORCH: "ORCHARD",
  OVAL: "OVAL",
  OPAS: "OVERPASS",
  PARK: "PARK",
  PARKS: "PARKS",
  PKWY: "PARKWAY",
  PKWYS: "PARKWAYS",
  PASS: "PASS",
  PSGE: "PASSAGE",
  PATH: "PATH",
  PIKE: "PIKE",
  PNE: "PINE",
  PNES: "PINES",
  PL: "PLACE",
  PLN: "PLAIN",
  PLNS: "PLAINS",
  PLZ: "PLAZA",
  PT: "POINT",
  PTS: "POINTS",
  PRT: "PORT",
  PRTS: "PORTS",
  PR: "PRAIRIE",
  RADL: "RADIAL",
  RAMP: "RAMP",
  RNCH: "RANCH",
  RPD: "RAPID",
  RPDS: "RAPIDS",
  RST: "REST",
  RDG: "RIDGE",
  RDGS: "RIDGES",
  RIV: "RIVER",
  RD: "ROAD",
  RDS: "ROADS",
  RTE: "ROUTE",
  ROW: "ROW",
  RUE: "RUE",
  RUN: "RUN",
  SHL: "SHOAL",
  SHLS: "SHOALS",
  SHR: "SHORE",
  SHRS: "SHORES",
  SKWY: "SKYWAY",
  SPG: "SPRING",
  SPGS: "SPRINGS",
  SPUR: "SPUR",
  SPURS: "SPURS",
  SQ: "SQUARE",
  SQS: "SQUARES",
  STA: "STATION",
  STRA: "STRAVENUE",
  STRM: "STREAM",
  ST: "STREET",
  STS: "STREETS",
  SMT: "SUMMIT",
  TER: "TERRACE",
  TRWY: "THROUGHWAY",
  TRCE: "TRACE",
  TRAK: "TRACK",
  TRFY: "TRAFFICWAY",
  TRL: "TRAIL",
  TRLR: "TRAILER",
  TUNL: "TUNNEL",
  TPKE: "TURNPIKE",
  UPAS: "UNDERPASS",
  UN: "UNION",
  UNS: "UNIONS",
  VLY: "VALLEY",
  VLYS: "VALLEYS",
  VIA: "VIADUCT",
  VW: "VIEW",
  VWS: "VIEWS",
  VLG: "VILLAGE",
  VLGS: "VILLAGES",
  VL: "VILLE",
  VIS: "VISTA",
  WALK: "WALK",
  WALKS: "WALKS",
  WALL: "WALL",
  WAY: "WAY",
  WAYS: "WAYS",
  WL: "WELL",
  WLS: "WELLS",
};
function getStreetTypeName(streetTypeAbbr) {
  const streetTypeName = streetTypeMap[streetTypeAbbr];
  if (streetTypeName == undefined)
    throw new Error('StreetType mapping not found: "' + streetTypeAbbr + '"');
  return capitalize(streetTypeName);
}
export function getStreetTypeNames() {
  return Object.values(streetTypeMap).map((item) => item.toLowerCase());
}

/**
 * Converts the city name in the UGRC data to the proper city name that is used in OSM.
 *
 * This is needed because UGRC sometimes includes `City` or `Town` in the city name when it isn't part of the official city name.
 *
 * This map is used after the city name has been ran thorugh `capitalize`, so the values here reflect that.
 */
const cityMap = {
  "St George City": "St George",
  "Ogden City": "Ogden",
  "West Jordan City": "West Jordan",
  "Sandy City": "Sandy",
  "Logan City": "Logan",
  "Taylorsville City": "Taylorsville",
  "Herriman Town": "Herriman",
  "Washington City": "Washington",
  "Draper City (sl Co)": "Draper",
  "South Salt Lake City": "South Salt Lake",
  "Hurricane City": "Hurricane",
  "City Of Holladay": "Holladay",
  "Roy City": "Roy",
  "Magna City": "Magna",
  "Park City (summit Co)": "Park City",
  "City Of North Salt Lake": "North Salt Lake",
  "North Ogden City": "North Ogden",
  "Bluffdale (sl Co)": "Bluffdale",
  "Santaquin City (utah Co)": "Santaquin",
  "Woods Cross City": "Woods Cross",
  "Richfield City": "Richfield",
  "Santa Clara City": "Santa Clara",
  "Moab City": "Moab",
  "Farr West City": "Farr West",
  "Nephi City": "Nephi",
  "Brian Head City": "Brian Head",
  "Hyde Park City": "Hyde Park",
  "Kanab City": "Kanab",
  "Perry City": "Perry",
  "La Verkin City": "La Verkin",
  "Hideout (wasatch)": "Hideout",
  "Draper City (utah Co)": "Draper",
  "Delta City": "Delta",
  "Helper City": "Helper",
  "Mount Pleasant City": "Mount Pleasant",
  "Marriott-slaterville City": "Marriott-Slaterville",
  "East Carbon City": "East Carbon",
  "Willard City": "Willard",
  "Toquerville City": "Toquerville",
  "Honeyville City": "Honeyville",
  "Mantua Town": "Mantua",
  "Virgin Town": "Virgin",
  "Hildale City": "Hildale",
  "Corinne City": "Corinne",
  "Annabella Town": "Annabella",
  "Koosharem Town": "Koosharem",
  "Sigurd Town": "Sigurd",
  "Rush Valley Town": "Rush Valley",
  "Interlaken Town": "Interlaken",
  "Hanksville Town": "Hanksville",
  "Rocky Ridge Town": "Rocky Ridge",
  "Dutch John City": "Dutch John",
  "Howell City": "Howell",
  "Leamington Town": "Leamington",
  "Snowville Town": "Snowville",
  "Park City (wasatch Co)": "Park City",
};

/** Process a single address point. */
function normalizeStreetName(address) {
  let streetName = capitalize(address.streetname);

  if (address.suffixdir && address.streettype) {
    // Special case for when both a street type and suffix direction are set
    if (streetName.match(/^[0-9]+$/)) {
      // If the street name is only a number, use the suffix direction
      const dirName = getDirName(address.suffixdir);
      streetName = streetName.concat(" ").concat(dirName);

      if (address.streettype === "CIR") {
        // If the street type is CIR (circle), then use that too, otherwise, ignore the street type
        const streetTypeName = getStreetTypeName(address.streettype);
        streetName = streetName.concat(" ").concat(streetTypeName);
      }
    } else {
      // If the street name contains non-numerical characters, ignore it and just use the street type
      const streetTypeName = getStreetTypeName(address.streettype);
      streetName = streetName.concat(" ").concat(streetTypeName);
    }
  } else if (address.suffixdir) {
    // In this case, it's a numbered street like 900 South
    const dirName = getDirName(address.suffixdir);
    streetName = streetName.concat(" ").concat(dirName);
  } else if (address.streettype) {
    // In this case, it's a named street like Abc Avenue
    const streetTypeName = getStreetTypeName(address.streettype);
    streetName = streetName.concat(" ").concat(streetTypeName);
  }

  if (address.prefixdir) {
    // There is a direction before the street name, which should be added to the final street name
    const preDirName = getDirName(address.prefixdir);
    streetName = preDirName.concat(" ").concat(streetName);
  }

  return streetName;
}

export function normalizeAddress(address) {
  const addr = {};

  // Handle cases where addnumsuffix is set
  // It could either be a unit number, a prefix direction, or "1/2" (determined by manual review of the UGRC data, not guaranteed)
  if (address.addnumsufix) {
    if (address.addnumsufix === "1/2") {
      //TODO: Determine the best way to handle this case
    } else if (address.addnumsufix.match(/^(N|E|S|W)$/) && !address.prefixdir) {
      address.prefixdir = address.addnumsufix; // Use addnumsuffix as the prefix direction
    } else if (!address.unitid) {
      address.unitid = address.addnumsufix; // Use addnumsuffix as the unit number
    }
  }

  if (address.unitid) {
    addr["addr:unit"] = address.unitid;
  }
  if (address.addnum) {
    addr["addr:housenumber"] = address.addnum;
  }
  if (address.streetname) {
    addr["addr:street"] = normalizeStreetName(address);
  }
  if (address.city) {
    const capitalizedCity = capitalize(address.city);
    addr["addr:city"] = cityMap[capitalizedCity] || capitalizedCity;
  }
  if (address.state) {
    addr["addr:state"] = address.state;
  }
  if (address.zipcode) {
    addr["addr:postcode"] = address.zipcode;
  }

  return addr;
}
