import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  AlertCircle,
  Map as MapIcon,
  TrendingUp,
  Scale,
  ZoomIn,
  Loader2,
  RefreshCw,
  Info,
  Radio,
  X,
  Target,
  Activity,
} from 'lucide-react';
import { geoMercator, geoPath, geoArea } from 'd3-geo';
import { STATE_TO_REGION_MAP, GRID_REGIONS_CONFIG } from '../../constants/gridData';
import { DistrictIntelligencePanel } from './DistrictIntelligencePanel';
import { AnomalyResolutionDrawer } from '../resolution/AnomalyResolutionDrawer';
import {
  SUPPORTED_STATES,
  isStateSupported,
  getStateDistrictSlug,
  METRIC_THRESHOLDS,
  TIER_CONFIG,
  classifyDistrictTier,
  type AnomalyTier,
} from '../../constants/supportedStates';
import cityStreamData from '../../data/cityStream.json';
import districtStreamData from '../../data/districtStream.json';
import { CITIES_BY_STATE } from '../../data/cityData';

export type MetricType = 'score' | 'anomalyRate' | 'flaggedCount' | 'estimatedLoss';

export interface DistrictStats {
  n: number;
  flagged: number;
  trueAnomalies: number;
  avgScore: number;
}

export interface DistrictMetrics extends DistrictStats {
  district: string;
  state: string;
  metricValue: number;
  tier: AnomalyTier;
}

export interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    name: string;
    state?: string;
    [key: string]: any;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
}

export interface GeoJSONData {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface CityNodePoint {
  name: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  meterCount: number;
  flaggedCount: number;
  avgScore: number;
}

// Module-level cache for loaded & normalized GeoJSON files keyed by slug
const geoJsonCache = new Map<string, GeoJSONData>();

// Compute national flag threshold (top 15% cutoff)
const computeFlagThreshold = (): number => {
  const scores = (cityStreamData.stream as any[]).map((m: any) => m.score);
  scores.sort((a, b) => a - b);
  const n = scores.length;
  return scores[Math.floor(n * 0.85)] ?? 0.85;
};

const FLAG_THRESHOLD = computeFlagThreshold();

/**
 * Normalizes GeoJSON coordinates for D3 spherical projections.
 * Legacy shapefiles often store rings with clockwise winding, which in spherical
 * geometry represents the outer complement of the globe (geoArea > 2*PI).
 * Reversing these rings restores correct interior polygons.
 */
const rewindRingIfNeeded = (ring: number[][]): number[][] => {
  try {
    const testPoly: any = { type: 'Polygon', coordinates: [ring] };
    if (geoArea(testPoly) > 2 * Math.PI) {
      return ring.slice().reverse();
    }
  } catch {
    // If area calculation fails, preserve original ring
  }
  return ring;
};

const normalizeGeometry = (geom: any): any => {
  if (!geom) return geom;
  if (geom.type === 'Polygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map(rewindRingIfNeeded),
    };
  } else if (geom.type === 'MultiPolygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map((poly: number[][][]) => poly.map(rewindRingIfNeeded)),
    };
  }
  return geom;
};

export const normalizeGeoJSON = (geo: GeoJSONData): GeoJSONData => {
  return {
    ...geo,
    features: geo.features.map((f) => ({
      ...f,
      geometry: normalizeGeometry(f.geometry),
    })),
  };
};

const SVG_VIEW_WIDTH = 520;
const SVG_VIEW_HEIGHT = 580;
const PADDING = 26;

export const StateDeepDive: React.FC<{
  preselectedState?: string;
  onNavigateToInvestigations?: () => void;
}> = ({ preselectedState, onNavigateToInvestigations }) => {
  // State selection initialized to preselectedState if supported, otherwise first priority state
  const [selectedState, setSelectedState] = useState<string>(() => {
    if (preselectedState && isStateSupported(preselectedState)) {
      return preselectedState;
    }
    return SUPPORTED_STATES[0];
  });

  // Track if user explicitly requested an unsupported state
  const unsupportedRequestedState =
    preselectedState && !isStateSupported(preselectedState) ? preselectedState : null;

  // Keep selected state in sync if preselectedState prop changes
  useEffect(() => {
    if (preselectedState && isStateSupported(preselectedState)) {
      setSelectedState(preselectedState);
    }
  }, [preselectedState]);

  const [metric, setMetric] = useState<MetricType>('score');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);
  const [hoveredCity, setHoveredCity] = useState<CityNodePoint | null>(null);
  const [showCitiesOverlay, setShowCitiesOverlay] = useState<boolean>(true);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'panel' | 'table'>('panel');

  // GeoJSON state
  const [districtGeoJSON, setDistrictGeoJSON] = useState<GeoJSONData | null>(() => {
    const slug = getStateDistrictSlug(selectedState);
    return geoJsonCache.get(slug) || null;
  });
  const [isLoadingGeoJSON, setIsLoadingGeoJSON] = useState<boolean>(() => {
    const slug = getStateDistrictSlug(selectedState);
    return !geoJsonCache.has(slug);
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadDetails, setLoadDetails] = useState<string | null>(null);

  const [retryCounter, setRetryCounter] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Clear district selection when switching states
  useEffect(() => {
    setSelectedDistrict(null);
    setHoveredDistrict(null);
    setHoveredCity(null);
  }, [selectedState]);

  // Load GeoJSON with reliable caching, status logging, and error handling
  useEffect(() => {
    let isCurrent = true;
    const slug = getStateDistrictSlug(selectedState);
    const requestedUrl = `/geo/districts/${slug}.json`;

    // 1. Check module-level cache
    if (geoJsonCache.has(slug)) {
      console.log(
        `[UrjaSetu StateDeepDive] Using cached GeoJSON for state="${selectedState}" (slug="${slug}")`
      );
      setDistrictGeoJSON(geoJsonCache.get(slug)!);
      setIsLoadingGeoJSON(false);
      setLoadError(null);
      setLoadDetails(null);
      return;
    }

    // 2. Fetch from public/geo/districts/
    setIsLoadingGeoJSON(true);
    setDistrictGeoJSON(null);
    setLoadError(null);
    setLoadDetails(null);

    console.log(
      `[UrjaSetu StateDeepDive] Fetching: state="${selectedState}", slug="${slug}", url="${requestedUrl}"`
    );

    fetch(requestedUrl)
      .then((response) => {
        console.log(
          `[UrjaSetu StateDeepDive] Response: HTTP ${response.status} ${response.statusText} for "${requestedUrl}"`
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} (${response.statusText || 'File Not Found'})`);
        }
        return response.json();
      })
      .then((rawJson) => {
        if (!isCurrent) return;

        // GeoJSON structural validation
        if (!rawJson || rawJson.type !== 'FeatureCollection' || !Array.isArray(rawJson.features)) {
          throw new Error('Invalid GeoJSON: Expected FeatureCollection with features array');
        }
        if (rawJson.features.length === 0) {
          throw new Error('GeoJSON contains 0 district features');
        }

        // Normalize rings for accurate D3 spherical projection
        const normalized = normalizeGeoJSON(rawJson);

        // Store in module cache
        geoJsonCache.set(slug, normalized);

        setDistrictGeoJSON(normalized);
        setIsLoadingGeoJSON(false);
        setLoadError(null);
        setLoadDetails(null);
        console.log(
          `[UrjaSetu StateDeepDive] Successfully loaded and cached ${normalized.features.length} districts for "${selectedState}"`
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
          `[UrjaSetu StateDeepDive] Failed to load district GeoJSON for "${selectedState}" (slug="${slug}", url="${requestedUrl}"):`,
          error
        );
        setDistrictGeoJSON(null);
        setIsLoadingGeoJSON(false);
        setLoadError('District map unavailable for this state');
        setLoadDetails(`Resource: ${requestedUrl} • Error: ${msg}`);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedState, retryCounter]);

  // Compute Raw Metric Helper
  const getRawMetric = (stats: DistrictStats, m: MetricType): number => {
    switch (m) {
      case 'score':
        return stats.avgScore;
      case 'anomalyRate':
        return stats.n > 0 ? (stats.trueAnomalies / stats.n) * 100 : 0;
      case 'flaggedCount':
        return stats.n > 0 ? (stats.flagged / stats.n) * 100 : 0;
      case 'estimatedLoss':
        return stats.n > 0 ? (stats.flagged * 10) / stats.n : 0;
    }
  };

  // Compute District Stream Stats
  const { districtStatsMap, districtList } = useMemo(() => {
    const stateData = (districtStreamData.data as any)[selectedState] || {};
    const statsMap: Record<string, DistrictStats> = {};

    Object.entries(stateData).forEach(([districtName, stats]: [string, any]) => {
      const s: DistrictStats = {
        n: stats.n ?? 25,
        flagged: stats.flagged ?? 0,
        trueAnomalies: stats.trueAnomalies ?? 0,
        avgScore: stats.avgScore ?? 0,
      };
      statsMap[districtName] = s;
    });

    // Build structured DistrictMetrics list using standard classification
    const list: DistrictMetrics[] = Object.entries(statsMap).map(([name, s]) => {
      const val = getRawMetric(s, metric);
      const tier = classifyDistrictTier(val, metric);

      return {
        district: name,
        state: selectedState,
        ...s,
        metricValue: val,
        tier,
      };
    });

    // Sort descending by metric value
    list.sort((a, b) => b.metricValue - a.metricValue);

    return {
      districtStatsMap: statsMap,
      districtList: list,
    };
  }, [selectedState, metric]);

  // Overall State & National Summary Stats
  const stateSummary = useMemo(() => {
    const totalMeters = districtList.reduce((sum, d) => sum + d.n, 0);
    const flaggedMeters = districtList.reduce((sum, d) => sum + d.flagged, 0);
    const anomalies = districtList.reduce((sum, d) => sum + d.trueAnomalies, 0);
    const avgScore =
      districtList.length > 0
        ? districtList.reduce((sum, d) => sum + d.avgScore, 0) / districtList.length
        : 0;

    const nationalFlagged = (cityStreamData.stream as any[]).filter(
      (m: any) => m.score >= FLAG_THRESHOLD
    ).length;
    const nationalTotal = (cityStreamData.stream as any[]).length;

    return {
      totalMeters,
      flaggedMeters,
      flaggedPercent: totalMeters > 0 ? (flaggedMeters / totalMeters) * 100 : 0,
      anomalies,
      trueAnomalyPercent: totalMeters > 0 ? (anomalies / totalMeters) * 100 : 0,
      avgScore,
      nationalFlaggedPercent: nationalTotal > 0 ? (nationalFlagged / nationalTotal) * 100 : 0,
    };
  }, [districtList]);

  // D3 Projection and SVG Path Computation
  const { pathGenerator, districtPathMap, districtCentroidMap, districtBoundsMap } = useMemo(() => {
    if (!districtGeoJSON || districtGeoJSON.features.length === 0) {
      return {
        pathGenerator: null,
        districtPathMap: new Map<string, string>(),
        districtCentroidMap: new Map<string, [number, number]>(),
        districtBoundsMap: new Map<string, [[number, number], [number, number]]>(),
      };
    }

    const projection = geoMercator().fitExtent(
      [[PADDING, PADDING], [SVG_VIEW_WIDTH - PADDING, SVG_VIEW_HEIGHT - PADDING]],
      districtGeoJSON as any
    );
    const pathGen = geoPath().projection(projection);

    const pathMap = new Map<string, string>();
    const centroidMap = new Map<string, [number, number]>();
    const boundsMap = new Map<string, [[number, number], [number, number]]>();

    for (const feature of districtGeoJSON.features) {
      const name = feature.properties.name;
      const d = pathGen(feature as any);
      if (d) {
        pathMap.set(name, d);
        const c = pathGen.centroid(feature as any);
        if (c && !isNaN(c[0]) && !isNaN(c[1])) {
          centroidMap.set(name, c);
        }
        const b = pathGen.bounds(feature as any);
        if (b && !isNaN(b[0][0]) && !isNaN(b[0][1])) {
          boundsMap.set(name, b);
        }
      }
    }

    return {
      pathGenerator: pathGen,
      districtPathMap: pathMap,
      districtCentroidMap: centroidMap,
      districtBoundsMap: boundsMap,
    };
  }, [districtGeoJSON]);

  // Verified Cities Point Overlay (TASK 6)
  const verifiedCityNodes = useMemo<CityNodePoint[]>(() => {
    if (!pathGenerator) return [];
    const cities = CITIES_BY_STATE[selectedState] || [];
    const proj = pathGenerator.projection() as any;

    return cities
      .map((city) => {
        const coords = proj ? proj([city.lon, city.lat]) : null;
        if (!coords || isNaN(coords[0]) || isNaN(coords[1])) {
          return null;
        }

        const metersInCity = (cityStreamData.stream as any[]).filter(
          (m: any) =>
            m.state === selectedState &&
            m.city &&
            m.city.toLowerCase() === city.name.toLowerCase()
        );
        const flaggedInCity = metersInCity.filter((m: any) => m.score >= FLAG_THRESHOLD).length;
        const avgScore =
          metersInCity.length > 0
            ? metersInCity.reduce((sum: number, m: any) => sum + m.score, 0) / metersInCity.length
            : 0;

        return {
          name: city.name,
          lat: city.lat,
          lon: city.lon,
          x: coords[0],
          y: coords[1],
          meterCount: metersInCity.length,
          flaggedCount: flaggedInCity,
          avgScore,
        };
      })
      .filter((c): c is CityNodePoint => c !== null);
  }, [selectedState, pathGenerator]);

  // Synchronize map click to table scroll
  useEffect(() => {
    if (selectedDistrict && tableContainerRef.current) {
      const rowEl = document.getElementById(`district-row-${selectedDistrict}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedDistrict]);

  // Selected district metrics
  const activeDistrictMetrics = useMemo(() => {
    if (!selectedDistrict) return null;
    return districtList.find((d) => d.district === selectedDistrict) || null;
  }, [selectedDistrict, districtList]);

  // Hovered district metrics
  const hoveredDistrictMetrics = useMemo(() => {
    if (!hoveredDistrict) return null;
    return districtList.find((d) => d.district === hoveredDistrict) || null;
  }, [hoveredDistrict, districtList]);

  // Metric formatters
  const formatMetricVal = (val: number, m: MetricType): string => {
    if (m === 'score') return val.toFixed(3);
    if (m === 'anomalyRate' || m === 'flaggedCount') return `${val.toFixed(1)}%`;
    return val.toFixed(2);
  };

  const getMetricHeaderLabel = (m: MetricType): string => {
    switch (m) {
      case 'score':
        return 'Anomaly Score';
      case 'anomalyRate':
        return 'Anomaly Rate %';
      case 'flaggedCount':
        return 'Flagged Meters %';
      case 'estimatedLoss':
        return 'Estimated Loss Index';
    }
  };

  const regionCode = STATE_TO_REGION_MAP[selectedState] || 'WR';
  const regionConfig = GRID_REGIONS_CONFIG[regionCode];
  const thresholdConfig = METRIC_THRESHOLDS[metric] || METRIC_THRESHOLDS.score;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050B14] text-slate-100 p-4 lg:p-6 gap-3 lg:gap-4">
      {/* Unsupported State Notice if navigated from outside */}
      {unsupportedRequestedState && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-amber-300">{unsupportedRequestedState}</span> is not yet in the 10 priority states list. Showing <span className="font-semibold text-white">{selectedState}</span> instead.
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-slate-400">Available:</span>
            {SUPPORTED_STATES.slice(0, 4).map((s) => (
              <button
                key={s}
                onClick={() => setSelectedState(s)}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0A1422] border border-[#1E3A5F] text-[#38BDF8] hover:bg-[#38BDF8]/20"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="rounded-lg bg-[#38BDF8]/5 border border-[#38BDF8]/20 p-3 flex items-start gap-2.5 flex-shrink-0">
        <AlertCircle className="w-4 h-4 text-[#38BDF8] flex-shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-xs text-slate-300 font-medium">
            Real district boundaries from Survey of India GeoJSON; anomaly telemetry derived from DP-FedAvg model stream.
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            Standardized classification: Low (≤{thresholdConfig.lowMax}{thresholdConfig.unit === '%' ? '%' : ''}) • Mid ({thresholdConfig.lowMax}–{thresholdConfig.midMax}{thresholdConfig.unit === '%' ? '%' : ''}) • High (&gt;{thresholdConfig.midMax}{thresholdConfig.unit === '%' ? '%' : ''}) • Flagged cutoff ≥ {FLAG_THRESHOLD.toFixed(4)}
          </p>
        </div>
      </div>

      {/* Header KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        <div className="p-3 lg:p-4 rounded-lg bg-[#0A1422] border border-[#14263D]">
          <div className="text-[10px] lg:text-xs font-mono text-slate-400 mb-1 truncate flex items-center justify-between">
            <span>{selectedState.toUpperCase()} FLAGGED %</span>
            <span
              className="text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold"
              style={{
                color: regionConfig.color,
                borderColor: `${regionConfig.color}40`,
                backgroundColor: `${regionConfig.color}15`,
              }}
            >
              {regionCode}
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-bold text-white font-mono">
            {stateSummary.flaggedPercent.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {stateSummary.flaggedMeters} of {stateSummary.totalMeters} meters
          </div>
        </div>

        <div className="p-3 lg:p-4 rounded-lg bg-[#0A1422] border border-[#14263D]">
          <div className="text-[10px] lg:text-xs font-mono text-slate-400 mb-1 truncate">
            NATIONAL FLAGGED %
          </div>
          <div className="text-xl lg:text-2xl font-bold text-[#38BDF8] font-mono">
            {stateSummary.nationalFlaggedPercent.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            National top 15% benchmark
          </div>
        </div>

        <div className="p-3 lg:p-4 rounded-lg bg-[#0A1422] border border-[#14263D]">
          <div className="text-[10px] lg:text-xs font-mono text-slate-400 mb-1 truncate">
            TRUE ANOMALIES
          </div>
          <div className="text-xl lg:text-2xl font-bold text-[#F59E0B] font-mono">
            {stateSummary.trueAnomalyPercent.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {stateSummary.anomalies} verified cases
          </div>
        </div>

        <div className="p-3 lg:p-4 rounded-lg bg-[#0A1422] border border-[#14263D]">
          <div className="text-[10px] lg:text-xs font-mono text-slate-400 mb-1 truncate">
            DISTRICTS MONITORED
          </div>
          <div className="text-xl lg:text-2xl font-bold text-[#10B981] font-mono">
            {districtList.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">
            Mean score: {stateSummary.avgScore.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Control Bar: Limited to 10 Priority States */}
      <div className="flex flex-wrap items-center gap-2.5 bg-[#0A1422]/70 p-2.5 rounded-lg border border-[#14263D] flex-shrink-0">
        {/* State Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono text-slate-400 font-semibold flex items-center gap-1">
            <MapIcon className="w-3.5 h-3.5 text-[#38BDF8]" />
            STATE:
          </label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="px-3 py-1.5 text-xs lg:text-sm bg-[#050B14] border border-[#1E3A5F] rounded text-white font-mono focus:outline-none focus:border-[#38BDF8] cursor-pointer hover:border-[#38BDF8]/60 transition-colors"
          >
            {SUPPORTED_STATES.map((state) => (
              <option key={state} value={state} className="bg-[#0A1422] text-white">
                {state}
              </option>
            ))}
          </select>
        </div>

        <div className="h-5 w-[1px] bg-[#14263D] hidden sm:block" />

        {/* Metric Selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-xs font-mono text-slate-400 font-semibold">METRIC:</label>
          <div className="flex gap-1">
            {(
              [
                { id: 'score', label: 'Anomaly Score' },
                { id: 'anomalyRate', label: 'Anomaly %' },
                { id: 'flaggedCount', label: 'Flagged %' },
                { id: 'estimatedLoss', label: 'Loss Index' },
              ] as { id: MetricType; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${
                  metric === m.id
                    ? 'bg-[#38BDF8] text-[#050B14] font-semibold shadow-sm shadow-[#38BDF8]/20'
                    : 'bg-[#050B14] border border-[#14263D] text-slate-400 hover:border-[#38BDF8]/60 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Overlay & Utility Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCitiesOverlay(!showCitiesOverlay)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-all flex items-center gap-1.5 ${
              showCitiesOverlay
                ? 'bg-[#38BDF8]/20 border border-[#38BDF8]/40 text-[#38BDF8]'
                : 'bg-[#050B14] border border-[#14263D] text-slate-400 hover:border-[#38BDF8]'
            }`}
            title="Toggle major city monitoring overlay"
          >
            <Radio className="w-3 h-3" />
            <span>City Centers</span>
          </button>

          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-all flex items-center gap-1.5 ${
              compareMode
                ? 'bg-[#B8FF65]/20 border border-[#B8FF65]/40 text-[#B8FF65]'
                : 'bg-[#050B14] border border-[#14263D] text-slate-400 hover:border-[#38BDF8]'
            }`}
            title="Toggle state comparison mode"
          >
            <Scale className="w-3 h-3" />
            <span>Benchmark</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Heatmap Map + Ranked Table */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: District Heatmap Map */}
        <div className="flex flex-col min-h-0 bg-[#0A1422] rounded-lg border border-[#14263D] overflow-hidden">
          {/* Map Header with Dynamic Color Legend */}
          <div className="p-3 bg-[#050B14] border-b border-[#14263D] flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-[#38BDF8]" />
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-300">
                {selectedState} District Boundaries
              </h3>
              {districtGeoJSON && (
                <span className="text-[10px] font-mono text-slate-500 bg-[#0A1422] px-1.5 py-0.5 rounded border border-[#14263D]">
                  {districtGeoJSON.features.length} districts
                </span>
              )}
            </div>

            {/* Documented 3-Level Anomaly Heatmap Legend (TASK 5) */}
            <div className="flex items-center gap-2.5 text-[10px] font-mono">
              <span className="text-slate-400 font-semibold">{getMetricHeaderLabel(metric)}:</span>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981] inline-block" />
                <span className="text-slate-300">
                  Low (≤{formatMetricVal(thresholdConfig.lowMax, metric)})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B] inline-block" />
                <span className="text-slate-300">
                  Mid ({formatMetricVal(thresholdConfig.lowMax, metric)}–{formatMetricVal(thresholdConfig.midMax, metric)})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444] inline-block" />
                <span className="text-slate-300">
                  High (&gt;{formatMetricVal(thresholdConfig.midMax, metric)})
                </span>
              </div>
              {showCitiesOverlay && verifiedCityNodes.length > 0 && (
                <div className="flex items-center gap-1 pl-1 border-l border-[#14263D]">
                  <span className="w-2 h-2 rounded-full border border-[#38BDF8] bg-[#38BDF8]/40 inline-block" />
                  <span className="text-[#38BDF8]">City Center</span>
                </div>
              )}
            </div>
          </div>

          {/* SVG Map Container */}
          <div className="flex-1 relative flex items-center justify-center p-2 min-h-0 overflow-hidden bg-[#070E1A]">
            {/* Loading State */}
            {isLoadingGeoJSON && (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Loader2 className="w-8 h-8 text-[#38BDF8] animate-spin" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-mono text-slate-300">
                    Loading district boundaries for {selectedState}...
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    Fetching Survey of India GeoJSON dataset
                  </p>
                </div>
              </div>
            )}

            {/* Error State with Diagnostic Message (TASK 3) */}
            {!isLoadingGeoJSON && loadError && (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md">
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <h4 className="text-sm font-semibold text-red-400 font-mono">
                    {loadError}
                  </h4>
                  {loadDetails && (
                    <p className="text-xs text-slate-400 font-mono bg-[#050B14] p-2 rounded border border-[#14263D] mt-1 break-all">
                      {loadDetails}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setRetryCounter((c) => c + 1)}
                  className="px-3 py-1.5 text-xs font-mono rounded bg-[#0A1422] border border-[#1E3A5F] text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Fetch
                </button>
              </div>
            )}

            {/* Empty Data State */}
            {!isLoadingGeoJSON && !loadError && districtGeoJSON && districtGeoJSON.features.length === 0 && (
              <div className="text-center p-6 text-slate-400 font-mono text-sm">
                No district boundary polygons found for {selectedState}.
              </div>
            )}

            {/* Success State: Interactive SVG Map */}
            {!isLoadingGeoJSON && !loadError && districtGeoJSON && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_VIEW_WIDTH} ${SVG_VIEW_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full max-h-[580px] select-none block"
                onClick={() => setSelectedDistrict(null)}
              >
                <defs>
                  {/* Subtle selection drop-glow */}
                  <filter id="selectionGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38BDF8" floodOpacity="0.8" />
                  </filter>
                  <filter id="hoverGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#38BDF8" floodOpacity="0.5" />
                  </filter>
                </defs>

                {/* District Boundary Polygons (TASK 4) */}
                <g className="district-polygons">
                  {districtGeoJSON.features.map((feature: GeoJSONFeature) => {
                    const districtName = feature.properties.name;
                    const pathD = districtPathMap.get(districtName);
                    if (!pathD) return null;

                    const stats = districtStatsMap[districtName];
                    const val = stats ? getRawMetric(stats, metric) : 0;
                    const tier = stats ? classifyDistrictTier(val, metric) : 'unknown';

                    const isSelected = selectedDistrict === districtName;
                    const isHovered = hoveredDistrict === districtName;
                    const tierStyle = TIER_CONFIG[tier];

                    const fillColor = isHovered
                      ? tierStyle.hoverFill
                      : isSelected
                        ? tierStyle.hoverFill
                        : tierStyle.fill;

                    return (
                      <path
                        key={`path-${districtName}`}
                        d={pathD}
                        fill={fillColor}
                        fillOpacity={isSelected ? 0.95 : isHovered ? 0.88 : 0.72}
                        stroke={isSelected ? '#38BDF8' : isHovered ? '#67E8F9' : '#0B1522'}
                        strokeWidth={isSelected ? 2.5 : isHovered ? 1.4 : 0.75}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        filter={isSelected ? 'url(#selectionGlow)' : isHovered ? 'url(#hoverGlow)' : undefined}
                        className="cursor-pointer transition-all duration-150"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDistrict(districtName);
                          setRightPanelTab('panel');
                        }}
                        onMouseEnter={() => setHoveredDistrict(districtName)}
                        onMouseLeave={() => setHoveredDistrict(null)}
                      />
                    );
                  })}
                </g>

                {/* District Name Labels (TASK 6) */}
                <g className="district-labels pointer-events-none">
                  {districtGeoJSON.features.map((feature: GeoJSONFeature) => {
                    const districtName = feature.properties.name;
                    const centroid = districtCentroidMap.get(districtName);
                    if (!centroid) return null;

                    const bounds = districtBoundsMap.get(districtName);
                    const isSelected = selectedDistrict === districtName;
                    const isHovered = hoveredDistrict === districtName;

                    // Calculate estimated district bounding area to prevent label overlap
                    let canFitLabel = false;
                    if (bounds) {
                      const bw = bounds[1][0] - bounds[0][0];
                      const bh = bounds[1][1] - bounds[0][1];
                      // Render label permanently if polygon is sufficiently large
                      canFitLabel = bw >= 32 && bh >= 24;
                    }

                    // Always show if hovered or selected, otherwise only if space allows
                    if (!canFitLabel && !isSelected && !isHovered) {
                      return null;
                    }

                    const displayName =
                      districtName.length > 15 && !isSelected && !isHovered
                        ? `${districtName.slice(0, 13)}…`
                        : districtName;

                    return (
                      <text
                        key={`label-${districtName}`}
                        x={centroid[0]}
                        y={centroid[1]}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={isSelected ? '11' : isHovered ? '10' : '8.5'}
                        fontWeight={isSelected ? '700' : isHovered ? '600' : '500'}
                        fill={isSelected ? '#FFFFFF' : '#F1F5F9'}
                        style={{
                          textShadow:
                            '0 1px 3px rgba(5,11,20,0.95), 0 0 4px rgba(5,11,20,0.9)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {displayName}
                      </text>
                    );
                  })}
                </g>

                {/* Verified City Points Overlay (TASK 6) */}
                {showCitiesOverlay && verifiedCityNodes.length > 0 && (
                  <g className="city-point-nodes">
                    {verifiedCityNodes.map((city) => {
                      const isHovered = hoveredCity?.name === city.name;
                      return (
                        <g
                          key={`city-${city.name}`}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredCity(city)}
                          onMouseLeave={() => setHoveredCity(null)}
                        >
                          {/* Pulsing radar ring */}
                          <circle
                            cx={city.x}
                            cy={city.y}
                            r={isHovered ? 8 : 6}
                            fill="#38BDF8"
                            fillOpacity={isHovered ? 0.35 : 0.2}
                            stroke="#38BDF8"
                            strokeWidth={1}
                            className="transition-all duration-200"
                          />
                          {/* Center core point */}
                          <circle
                            cx={city.x}
                            cy={city.y}
                            r={isHovered ? 3.5 : 2.5}
                            fill="#FFFFFF"
                            stroke="#0284C7"
                            strokeWidth={1}
                          />
                          {/* City Name Tag */}
                          <text
                            x={city.x}
                            y={city.y - 8}
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="600"
                            fill="#38BDF8"
                            className="pointer-events-none font-mono"
                            style={{
                              textShadow:
                                '0 1px 3px rgba(5,11,20,0.95), 0 0 2px rgba(5,11,20,0.9)',
                            }}
                          >
                            {city.name}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>
            )}

            {/* Hover Floating Tooltip for District */}
            {hoveredDistrictMetrics && (
              <div className="absolute top-3 left-3 pointer-events-none z-10 bg-[#050B14]/95 border border-[#1E3A5F] rounded-md p-2.5 shadow-xl backdrop-blur-md max-w-xs transition-opacity duration-150">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-mono font-bold text-xs text-white">
                    {hoveredDistrictMetrics.district}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${
                      TIER_CONFIG[hoveredDistrictMetrics.tier].badgeBg
                    } ${TIER_CONFIG[hoveredDistrictMetrics.tier].badgeBorder} ${
                      TIER_CONFIG[hoveredDistrictMetrics.tier].badgeText
                    }`}
                  >
                    {TIER_CONFIG[hoveredDistrictMetrics.tier].label} Anomaly
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
                  <div className="text-slate-400">DP-FedAvg Score:</div>
                  <div className="text-right text-slate-200 font-bold">
                    {hoveredDistrictMetrics.avgScore.toFixed(3)}
                  </div>
                  <div className="text-slate-400">Anomaly Rate:</div>
                  <div className="text-right text-amber-400">
                    {hoveredDistrictMetrics.n > 0
                      ? ((hoveredDistrictMetrics.trueAnomalies / hoveredDistrictMetrics.n) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </div>
                  <div className="text-slate-400">Flagged Meters:</div>
                  <div className="text-right text-red-400">
                    {hoveredDistrictMetrics.flagged} / {hoveredDistrictMetrics.n}
                  </div>
                  <div className="text-slate-400">Data Source:</div>
                  <div className="text-right text-slate-400 truncate">
                    Simulated (EXP-URJA)
                  </div>
                </div>
              </div>
            )}

            {/* Hover Floating Tooltip for City Node */}
            {hoveredCity && (
              <div className="absolute bottom-3 right-3 pointer-events-none z-10 bg-[#050B14]/95 border border-[#38BDF8]/40 rounded-md p-2.5 shadow-xl backdrop-blur-md max-w-xs">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#38BDF8] mb-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>{hoveredCity.name} Center</span>
                </div>
                <div className="text-[10px] font-mono text-slate-300">
                  {hoveredCity.meterCount > 0 ? (
                    <>
                      <div>Monitored Meters: {hoveredCity.meterCount}</div>
                      <div>Flagged: {hoveredCity.flaggedCount}</div>
                      <div>Avg Score: {hoveredCity.avgScore.toFixed(3)}</div>
                    </>
                  ) : (
                    <div className="text-slate-400">Regional monitoring node ({hoveredCity.lat.toFixed(2)}°N, {hoveredCity.lon.toFixed(2)}°E)</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected District Intelligence Card (TASK 4) */}
          {activeDistrictMetrics ? (
            <div className="p-3 bg-[#050B14] border-t border-[#14263D] flex items-center justify-between gap-3 flex-shrink-0 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-8 rounded-sm ${
                    activeDistrictMetrics.tier === 'high'
                      ? 'bg-red-500'
                      : activeDistrictMetrics.tier === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-white">
                      {activeDistrictMetrics.district}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({selectedState})
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-semibold ${
                        TIER_CONFIG[activeDistrictMetrics.tier].badgeBg
                      } ${TIER_CONFIG[activeDistrictMetrics.tier].badgeBorder} ${
                        TIER_CONFIG[activeDistrictMetrics.tier].badgeText
                      }`}
                    >
                      {TIER_CONFIG[activeDistrictMetrics.tier].label} Anomaly Tier
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-0.5">
                    <span>
                      Score:{' '}
                      <strong className="text-white">
                        {activeDistrictMetrics.avgScore.toFixed(3)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Flagged:{' '}
                      <strong className="text-red-400">
                        {activeDistrictMetrics.flagged} / {activeDistrictMetrics.n}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      True Anomaly:{' '}
                      <strong className="text-amber-400">
                        {activeDistrictMetrics.trueAnomalies}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRightPanelTab('panel')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 hover:bg-[#38BDF8]/30 transition-colors"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>District Intelligence →</span>
                </button>
                <button
                  onClick={() => setSelectedDistrict(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#14263D] transition-colors"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 bg-[#050B14]/80 border-t border-[#14263D] text-[11px] font-mono text-slate-500 flex items-center justify-between flex-shrink-0">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#38BDF8]" />
                Click any district polygon or table row to inspect anomaly telemetry
              </span>
              <span>{districtList.length} districts in model stream</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: District Intelligence Panel OR Ranked Districts Table */}
        <div className="flex flex-col min-h-0 bg-[#0A1422] rounded-lg border border-[#14263D] overflow-hidden">
          {/* Panel / Table View Mode Switcher Header if a district is selected */}
          {selectedDistrict && activeDistrictMetrics && (
            <div className="p-2.5 bg-[#050B14] border-b border-[#14263D] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRightPanelTab('panel')}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                    rightPanelTab === 'panel'
                      ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-[#0E2036]'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  <span>{selectedDistrict} Intelligence</span>
                </button>
                <button
                  onClick={() => setRightPanelTab('table')}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                    rightPanelTab === 'table'
                      ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-[#0E2036]'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" />
                  <span>All Ranked Districts ({districtList.length})</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedDistrict(null)}
                className="text-[10px] font-mono text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-[#14263D] transition-colors"
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Conditional View: District Intelligence Panel vs Ranked Districts Table */}
          {selectedDistrict && activeDistrictMetrics && rightPanelTab === 'panel' ? (
            <DistrictIntelligencePanel
              districtName={selectedDistrict}
              stateName={selectedState}
              districtStats={activeDistrictMetrics}
              tier={activeDistrictMetrics.tier}
              onClose={() => setSelectedDistrict(null)}
              onOpenCase={(caseId) => setOpenCaseId(caseId)}
            />
          ) : (
            <>
              <div className="p-3 bg-[#050B14] border-b border-[#14263D] flex items-center justify-between flex-shrink-0">
                <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#38BDF8]" />
                  Districts Ranked by {getMetricHeaderLabel(metric)}
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  Showing {districtList.length} districts
                </span>
              </div>

              <div
                ref={tableContainerRef}
                className="flex-1 overflow-y-auto min-h-0 divide-y divide-[#14263D]"
              >
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#08111D] border-b border-[#14263D] text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                  <div className="col-span-1">#</div>
                  <div className="col-span-4">District</div>
                  <div className="col-span-2 text-right">Meters</div>
                  <div className="col-span-2 text-right">
                    {metric === 'score' ? 'Score' : metric === 'anomalyRate' ? 'Anom %' : 'Rate %'}
                  </div>
                  <div className="col-span-2 text-right">Flagged</div>
                  <div className="col-span-1 text-center">Inspect</div>
                </div>

                {/* Table Body */}
                {districtList.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-mono text-xs">
                    No telemetry data available for this state.
                  </div>
                ) : (
                  districtList.map((district, idx) => {
                    const isSelected = selectedDistrict === district.district;
                    const isHovered = hoveredDistrict === district.district;
                    const tierStyle = TIER_CONFIG[district.tier];

                    return (
                      <div
                        key={`row-${district.district}`}
                        id={`district-row-${district.district}`}
                        onClick={() => {
                          setSelectedDistrict(district.district);
                          setRightPanelTab('panel');
                        }}
                        onMouseEnter={() => setHoveredDistrict(district.district)}
                        onMouseLeave={() => setHoveredDistrict(null)}
                        className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs font-mono transition-all cursor-pointer items-center ${
                          isSelected
                            ? 'bg-[#38BDF8]/20 border-l-4 border-l-[#38BDF8]'
                            : isHovered
                              ? 'bg-[#0E2036]'
                              : 'hover:bg-[#0A1828]'
                        }`}
                      >
                        {/* Rank */}
                        <div className="col-span-1 text-slate-500 text-[11px] font-semibold">
                          {idx + 1}
                        </div>

                        {/* District Name */}
                        <div className="col-span-4 font-medium text-slate-200 truncate flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tierStyle.fill }}
                          />
                          <span className="truncate">{district.district}</span>
                        </div>

                        {/* Meters Monitored */}
                        <div className="col-span-2 text-right text-slate-400">
                          {district.n}
                        </div>

                        {/* Current Metric Value (Consistent with Map Colors) */}
                        <div
                          className="col-span-2 text-right font-bold"
                          style={{ color: tierStyle.fill }}
                        >
                          {formatMetricVal(district.metricValue, metric)}
                        </div>

                        {/* Flagged Count Badge */}
                        <div className="col-span-2 text-right">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                              district.flagged > 0
                                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {district.flagged}
                          </span>
                        </div>

                        {/* Inspect Button */}
                        <div className="col-span-1 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDistrict(district.district);
                              setRightPanelTab('panel');
                            }}
                            className={`p-1 rounded transition-colors ${
                              isSelected
                                ? 'text-[#38BDF8] bg-[#38BDF8]/20'
                                : 'text-slate-500 hover:text-[#38BDF8]'
                            }`}
                            title="Highlight on map and inspect intelligence"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Connected Anomaly Resolution Center Drawer */}
      <AnomalyResolutionDrawer
        caseId={openCaseId}
        onClose={() => setOpenCaseId(null)}
        onNavigateToInvestigations={onNavigateToInvestigations}
      />
    </div>
  );
};

