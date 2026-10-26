/**
 * Central Configuration for Supported States & Anomaly Heatmap Thresholds
 * 
 * Defines the 10 priority states for district-level boundary visualization
 * and standardized anomaly risk thresholds across UrjaSetu.
 */

export const SUPPORTED_STATES = [
  'Maharashtra',
  'Gujarat',
  'Rajasthan',
  'Uttar Pradesh',
  'Madhya Pradesh',
  'Karnataka',
  'Tamil Nadu',
  'West Bengal',
  'Assam',
  'Bihar',
] as const;

export type SupportedState = (typeof SUPPORTED_STATES)[number];

// Alias for backwards compatibility
export const PRIORITY_STATES = SUPPORTED_STATES;
export type PriorityState = SupportedState;

/**
 * Check if a state is among the 10 configured priority states
 */
export const isStateSupported = (stateName: string): boolean => {
  return SUPPORTED_STATES.includes(stateName as SupportedState);
};

/**
 * Generate lowercase, hyphen-separated slugs matching files in public/geo/districts/
 */
export const getStateDistrictSlug = (stateName: string): string => {
  return stateName
    .toLowerCase()
    .replace(/ & /g, '-')
    .replace(/ and /g, '-')
    .replace(/ /g, '-')
    .replace(/[āīūēōç]/g, (c) => ({ ā: 'a', ī: 'i', ū: 'u', ē: 'e', ō: 'o', ç: 'c' }[c] || c))
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
};

/**
 * Standardized District Anomaly Thresholds
 * Used deterministically across both the Heatmap and Ranked District Tables.
 */
export type AnomalyTier = 'low' | 'medium' | 'high' | 'unknown';

export interface HeatmapThresholdConfig {
  lowMax: number;
  midMax: number;
  unit: string;
  description: string;
}

export const METRIC_THRESHOLDS: Record<string, HeatmapThresholdConfig> = {
  score: {
    lowMax: 0.60,
    midMax: 0.72,
    unit: 'Score',
    description: 'DP-FedAvg anomaly score (0.0 to 1.0)',
  },
  anomalyRate: {
    lowMax: 15.0,
    midMax: 25.0,
    unit: '%',
    description: 'Prevalence of verified anomalous smart meters',
  },
  flaggedCount: {
    lowMax: 12.0,
    midMax: 20.0,
    unit: '%',
    description: 'Meters exceeding national top 15% threshold',
  },
  estimatedLoss: {
    lowMax: 1.0,
    midMax: 2.0,
    unit: 'Idx',
    description: 'Estimated non-technical loss index',
  },
};

export const TIER_CONFIG: Record<
  AnomalyTier,
  {
    fill: string;
    hoverFill: string;
    stroke: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    label: string;
    ariaLabel: string;
  }
> = {
  low: {
    fill: '#10B981',
    hoverFill: '#34D399',
    stroke: '#059669',
    badgeBg: 'bg-emerald-500/20',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-400',
    label: 'Low',
    ariaLabel: 'Low anomaly risk',
  },
  medium: {
    fill: '#F59E0B',
    hoverFill: '#FBBF24',
    stroke: '#D97706',
    badgeBg: 'bg-amber-500/20',
    badgeBorder: 'border-amber-500/30',
    badgeText: 'text-amber-400',
    label: 'Medium',
    ariaLabel: 'Medium anomaly risk',
  },
  high: {
    fill: '#EF4444',
    hoverFill: '#F87171',
    stroke: '#DC2626',
    badgeBg: 'bg-red-500/20',
    badgeBorder: 'border-red-500/30',
    badgeText: 'text-red-400',
    label: 'High',
    ariaLabel: 'High anomaly risk',
  },
  unknown: {
    fill: '#334155',
    hoverFill: '#475569',
    stroke: '#64748B',
    badgeBg: 'bg-slate-500/20',
    badgeBorder: 'border-slate-500/30',
    badgeText: 'text-slate-400',
    label: 'No Data',
    ariaLabel: 'No anomaly data available',
  },
};

/**
 * Classification rule for anomaly metric value to tier
 */
export const classifyDistrictTier = (
  value: number,
  metricType: string = 'score'
): AnomalyTier => {
  const config = METRIC_THRESHOLDS[metricType] || METRIC_THRESHOLDS.score;
  if (value <= config.lowMax) return 'low';
  if (value <= config.midMax) return 'medium';
  return 'high';
};
