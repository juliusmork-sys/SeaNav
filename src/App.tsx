import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import {
  Anchor,
  Compass,
  Crosshair,
  Layers,
  LocateFixed,
  Satellite,
  ShieldAlert,
  SlidersHorizontal,
  X,
  Waves,
} from "lucide-react";

type PositionFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speedKnots: number | null;
  heading: number | null;
  headingSource: "gps" | "calculated" | "compass" | "none";
  timestamp: number;
};

type DepthState = {
  status: "idle" | "loading" | "ready" | "error";
  value: number | null;
  message: string;
};

const OSLO_FJORD: [number, number] = [10.735, 59.68];
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SJOKART_WMTS =
  "https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png";
const DEFAULT_DEPTH_STATE: DepthState = {
  status: "idle",
  value: null,
  message: "Waiting for position",
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const metersPerSecondToKnots = (speed: number) => speed * 1.943844492;
const normalizeBearing = (degrees: number) => (degrees + 360) % 360;

function distanceMeters(a: PositionFix, latitude: number, longitude: number) {
  const radius = 6371008.8;
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(latitude);
  const deltaPhi = toRadians(latitude - a.latitude);
  const deltaLambda = toRadians(longitude - a.longitude);
  const sinPhi = Math.sin(deltaPhi / 2);
  const sinLambda = Math.sin(deltaLambda / 2);
  const h =
    sinPhi * sinPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda;

  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(a: PositionFix, latitude: number, longitude: number) {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(latitude);
  const lambda1 = toRadians(a.longitude);
  const lambda2 = toRadians(longitude);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

function compassPoint(heading: number | null) {
  if (heading === null) return "--";
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return points[Math.round(heading / 22.5) % 16];
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`;
}

function formatDepth(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--";
  return `${Math.abs(value).toFixed(1)} m`;
}

function createAccuracyCircle(
  longitude: number,
  latitude: number,
  radiusMeters: number,
) {
  const points = 96;
  const coordinates: number[][] = [];
  const earthRadius = 6378137;
  const latRad = toRadians(latitude);

  for (let i = 0; i <= points; i += 1) {
    const bearing = (i / points) * Math.PI * 2;
    const lat =
      latitude + toDegrees((radiusMeters / earthRadius) * Math.cos(bearing));
    const lon =
      longitude +
      toDegrees(
        (radiusMeters / (earthRadius * Math.cos(latRad))) * Math.sin(bearing),
      );
    coordinates.push([lon, lat]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      },
    ],
  };
}

function parseDepthResponse(payload: unknown) {
  if (typeof payload === "number") return payload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.depth,
    record.elevation,
    record.value,
    record.z,
    record.water_depth,
    record.result,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") return candidate;
    if (typeof candidate === "string") {
      const parsed = Number.parseFloat(candidate);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

async function fetchEstimatedDepth(latitude: number, longitude: number) {
  const endpoints = [
    `https://ows.emodnet-bathymetry.eu/wcs_dtm/?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=emodnet:mean&FORMAT=application/json&SUBSET=Lat(${latitude})&SUBSET=Long(${longitude})`,
    `https://ows.emodnet-bathymetry.eu/rest/getdepth?lon=${longitude}&lat=${latitude}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { mode: "cors" });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        const depth = parseDepthResponse(await response.json());
        if (depth !== null) return depth;
      } else {
        const text = await response.text();
        const match = text.match(/-?\d+(?:\.\d+)?/);
        if (match) return Number.parseFloat(match[0]);
      }
    } catch {
      // Try the next known public endpoint, then degrade in the UI.
    }
  }

  throw new Error("Depth service unavailable");
}

function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const lastFixRef = useRef<PositionFix | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const depthAbortRef = useRef<number | null>(null);
  const orientationHeadingRef = useRef<number | null>(null);
  const [fix, setFix] = useState<PositionFix | null>(null);
  const [depth, setDepth] = useState<DepthState>(DEFAULT_DEPTH_STATE);
  const [tracking, setTracking] = useState(false);
  const [followingLocation, setFollowingLocation] = useState(true);
  const [northUp, setNorthUp] = useState(false);
  const [chartVisible, setChartVisible] = useState(true);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showTopbar, setShowTopbar] = useState(true);
  const [showReadouts, setShowReadouts] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showOwnship, setShowOwnship] = useState(true);
  const [showAccuracyRing, setShowAccuracyRing] = useState(true);
  const [showNotice, setShowNotice] = useState(true);

  const canAskOrientation =
    typeof window !== "undefined" &&
    "DeviceOrientationEvent" in window &&
    typeof (
      DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>;
      }
    ).requestPermission === "function";

  const setPositionOnMap = useCallback(
    (nextFix: PositionFix) => {
      const map = mapRef.current;
      if (!map) return;
      const point: [number, number] = [nextFix.longitude, nextFix.latitude];

      markerRef.current?.setLngLat(point);
      if (followingLocation) {
        map.easeTo({
          center: point,
          zoom: Math.max(map.getZoom(), 13),
          bearing: northUp ? 0 : (nextFix.heading ?? map.getBearing()),
          duration: 700,
        });
      }

      const source = map.getSource("accuracy") as maplibregl.GeoJSONSource;
      if (source && nextFix.accuracy) {
        source.setData(
          createAccuracyCircle(
            nextFix.longitude,
            nextFix.latitude,
            Math.max(nextFix.accuracy, 8),
          ) as GeoJSON.GeoJSON,
        );
      }
    },
    [followingLocation, northUp],
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: OPENFREEMAP_STYLE,
      center: OSLO_FJORD,
      zoom: 9,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on("dragstart", () => setFollowingLocation(false));

    map.on("load", () => {
      map.addSource("sjokart", {
        type: "raster",
        tiles: [SJOKART_WMTS],
        tileSize: 256,
        attribution: "Nautical chart: Kartverket",
      });
      map.addLayer({
        id: "sjokart",
        type: "raster",
        source: "sjokart",
        paint: {
          "raster-opacity": 0.68,
        },
      });
      map.addSource("accuracy", {
        type: "geojson",
        data: createAccuracyCircle(OSLO_FJORD[0], OSLO_FJORD[1], 0),
      });
      map.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: "accuracy",
        paint: {
          "fill-color": "#19b7d8",
          "fill-opacity": 0.15,
        },
      });
      map.addLayer({
        id: "accuracy-line",
        type: "line",
        source: "accuracy",
        paint: {
          "line-color": "#5ee7ff",
          "line-opacity": 0.75,
          "line-width": 2,
        },
      });
    });

    const markerEl = document.createElement("div");
    markerEl.className = "ownship-marker";
    markerEl.innerHTML =
      '<div class="ownship-arrow"></div><div class="ownship-pulse"></div>';
    markerRef.current = new maplibregl.Marker({ element: markerEl })
      .setLngLat(OSLO_FJORD)
      .addTo(map);
    mapRef.current = map;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sjokart")) return;
    map.setLayoutProperty(
      "sjokart",
      "visibility",
      chartVisible ? "visible" : "none",
    );
  }, [chartVisible]);

  useEffect(() => {
    const marker = markerRef.current?.getElement();
    if (marker) {
      marker.style.display = showOwnship ? "block" : "none";
    }
  }, [showOwnship]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("accuracy-fill")) return;
    const visibility = showAccuracyRing ? "visible" : "none";
    map.setLayoutProperty("accuracy-fill", "visibility", visibility);
    map.setLayoutProperty("accuracy-line", "visibility", visibility);
  }, [showAccuracyRing]);

  useEffect(() => {
    if (!fix) return;
    setPositionOnMap(fix);

    if (depthAbortRef.current) {
      window.clearTimeout(depthAbortRef.current);
    }

    setDepth((current) => ({
      ...current,
      status: "loading",
      message: "Updating estimate",
    }));

    depthAbortRef.current = window.setTimeout(() => {
      fetchEstimatedDepth(fix.latitude, fix.longitude)
        .then((value) => {
          setDepth({
            status: "ready",
            value,
            message: "Estimated from EMODnet DTM",
          });
        })
        .catch(() => {
          setDepth({
            status: "error",
            value: null,
            message: "Depth service unavailable",
          });
        });
    }, 650);
  }, [fix, setPositionOnMap]);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      }).webkitCompassHeading;
      const heading =
        typeof webkitHeading === "number"
          ? webkitHeading
          : typeof event.alpha === "number"
            ? normalizeBearing(360 - event.alpha)
            : null;
      orientationHeadingRef.current = heading;
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation, true);
  }, []);

  const startTracking = useCallback(async (requestCompass = true) => {
    if (!window.isSecureContext) {
      setTracking(false);
      return;
    }

    if (!("geolocation" in navigator)) {
      setTracking(false);
      return;
    }

    if (requestCompass && canAskOrientation) {
      try {
        await (
          DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<PermissionState>;
          }
        ).requestPermission();
      } catch {
        // Compass fallback is optional; location tracking remains useful.
      }
    }

    setTracking(true);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const previous = lastFixRef.current;
        const coords = position.coords;
        const calculatedSpeed =
          previous && position.timestamp > previous.timestamp
            ? distanceMeters(previous, coords.latitude, coords.longitude) /
              ((position.timestamp - previous.timestamp) / 1000)
            : null;
        const speedKnots =
          typeof coords.speed === "number" && coords.speed >= 0
            ? metersPerSecondToKnots(coords.speed)
            : calculatedSpeed !== null
              ? metersPerSecondToKnots(calculatedSpeed)
              : null;

        const gpsHeading =
          typeof coords.heading === "number" && !Number.isNaN(coords.heading)
            ? normalizeBearing(coords.heading)
            : null;
        const calculatedHeading =
          previous &&
          distanceMeters(previous, coords.latitude, coords.longitude) > 4
            ? bearingDegrees(previous, coords.latitude, coords.longitude)
            : null;
        const compassHeading =
          speedKnots !== null && speedKnots < 0.8
            ? orientationHeadingRef.current
            : null;
        const heading = gpsHeading ?? calculatedHeading ?? compassHeading;
        const headingSource = gpsHeading !== null
          ? "gps"
          : calculatedHeading !== null
            ? "calculated"
            : compassHeading !== null
              ? "compass"
              : "none";
        const nextFix: PositionFix = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy:
            typeof coords.accuracy === "number" ? coords.accuracy : null,
          speedKnots,
          heading,
          headingSource,
          timestamp: position.timestamp,
        };

        lastFixRef.current = nextFix;
        setFix(nextFix);
      },
      (error) => {
        setTracking(false);
        console.warn(error.message || "Location permission denied");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
  }, [canAskOrientation]);

  useEffect(() => {
    void startTracking(false);
  }, [startTracking]);

  const recenterOrToggleNorth = () => {
    const map = mapRef.current;
    if (!map) return;

    if (!followingLocation) {
      setFollowingLocation(true);
      if (fix) {
        map.easeTo({
          center: [fix.longitude, fix.latitude],
          zoom: Math.max(map.getZoom(), 13),
          bearing: northUp ? 0 : (fix.heading ?? map.getBearing()),
          duration: 600,
        });
      }
      return;
    }

    setNorthUp((value) => {
      const nextNorthUp = !value;
      map.easeTo({
        bearing: nextNorthUp ? 0 : (fix?.heading ?? map.getBearing()),
        duration: 500,
      });
      return nextNorthUp;
    });
  };

  const readouts = useMemo(
    () => [
      {
        label: "Latitude",
        value: fix ? formatCoordinate(fix.latitude, "N", "S") : "--",
      },
      {
        label: "Longitude",
        value: fix ? formatCoordinate(fix.longitude, "E", "W") : "--",
      },
      {
        label: "Speed",
        value: fix?.speedKnots !== null && fix?.speedKnots !== undefined
          ? `${fix.speedKnots.toFixed(1)} kn`
          : "--",
      },
      {
        label: "Heading",
        value:
          fix?.heading !== null && fix?.heading !== undefined
            ? `${Math.round(fix.heading).toString().padStart(3, "0")}° ${compassPoint(fix.heading)}`
            : "--",
      },
    ],
    [fix],
  );

  const toggles = [
    {
      label: "Status bar",
      checked: showTopbar,
      onChange: setShowTopbar,
    },
    {
      label: "Navigation data",
      checked: showReadouts,
      onChange: setShowReadouts,
    },
    {
      label: "Nav controls",
      checked: showControls,
      onChange: setShowControls,
    },
    {
      label: "Ownship marker",
      checked: showOwnship,
      onChange: setShowOwnship,
    },
    {
      label: "Accuracy ring",
      checked: showAccuracyRing,
      onChange: setShowAccuracyRing,
    },
    {
      label: "Safety notice",
      checked: showNotice,
      onChange: setShowNotice,
    },
    {
      label: "Nautical chart",
      checked: chartVisible,
      onChange: setChartVisible,
    },
  ];

  return (
    <main className="app-shell">
      <div ref={mapContainer} className="map" aria-label="Navigation map" />

      {showTopbar && (
        <section className="topbar" aria-label="Navigation status">
          <div className="brand">
            <Anchor size={22} strokeWidth={2.4} />
            <div>
              <strong>SeaNav</strong>
              <span>Oslo Fjord prototype</span>
            </div>
          </div>
        </section>
      )}

      {showReadouts && (
        <section className="readout-panel" aria-label="Live navigation data">
          <div className="primary-depth">
            <div>
              <span>Map depth</span>
              <strong>{formatDepth(depth.value)}</strong>
              <small>To land --</small>
            </div>
            <Waves size={28} />
          </div>
          <p className={depth.status === "error" ? "warning" : ""}>
            {depth.message}
          </p>

          <div className="readout-grid">
            {readouts.slice(0, 2).map((item) => (
              <div className="readout" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <div className="readout motion-readout">
              <div>
                <span>Speed</span>
                <strong>{readouts[2].value}</strong>
              </div>
              <div>
                <span>Heading</span>
                <strong>{readouts[3].value}</strong>
              </div>
            </div>
          </div>

          <div className="accuracy">
            <span className="accuracy-label">GPS accuracy</span>
            <span className="accuracy-target">
              <Crosshair size={18} />
              <span className={tracking ? "status-dot active" : "status-dot"} />
            </span>
            <strong className="accuracy-value">
              {fix?.accuracy ? `${Math.round(fix.accuracy)} m` : "--"}
            </strong>
          </div>

          <button
            type="button"
            className={
              followingLocation && northUp
                ? "location-mode-button active"
                : "location-mode-button"
            }
            onClick={recenterOrToggleNorth}
            title={
              followingLocation
                ? northUp
                  ? "Unlock north-up"
                  : "Fix north-up"
                : "Return to GPS location"
            }
          >
            {followingLocation ? <Compass size={20} /> : <LocateFixed size={20} />}
            <span>{followingLocation ? "Fix north" : "My location"}</span>
          </button>

          <div className="panel-actions">
            <button
              type="button"
              className={displayOpen ? "active" : ""}
              onClick={() => {
                setDisplayOpen((value) => !value);
                setControlsOpen(false);
              }}
              title="Show display options"
            >
              {displayOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
              <span>Settings</span>
            </button>
            <button
              type="button"
              className={controlsOpen ? "active" : ""}
              onClick={() => {
                setControlsOpen((value) => !value);
                setDisplayOpen(false);
              }}
              title="Show navigation controls"
            >
              {controlsOpen ? <X size={18} /> : <Layers size={18} />}
              <span>Nav layers</span>
            </button>
          </div>

          {displayOpen && (
            <div className="panel-drawer display-drawer">
              {toggles.map((item) => (
                <label className="toggle-row" key={item.label}>
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.onChange(event.target.checked)}
                  />
                </label>
              ))}
            </div>
          )}

          {controlsOpen && showControls && (
            <div className="panel-drawer embedded-controls">
              <button
                type="button"
                onClick={() => startTracking()}
                title="Start tracking"
              >
                <LocateFixed size={20} />
                <span>Start</span>
              </button>
              <button
                type="button"
                className={chartVisible ? "active" : ""}
                onClick={() => setChartVisible((value) => !value)}
                title="Toggle nautical chart"
              >
                <Layers size={20} />
                <span>Chart</span>
              </button>
              <button
                type="button"
                onClick={() => mapRef.current?.resetNorthPitch({ duration: 500 })}
                title="Reset bearing"
              >
                <Compass size={20} />
                <span>North</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  mapRef.current?.flyTo({
                    center: OSLO_FJORD,
                    zoom: 9,
                    bearing: 0,
                  })
                }
                title="Return to Oslo Fjord"
              >
                <Satellite size={20} />
                <span>Oslo</span>
              </button>
            </div>
          )}

          {showNotice && (
            <div className="notice">
              <ShieldAlert size={17} />
              <span>Situational awareness only. Not certified navigation.</span>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
