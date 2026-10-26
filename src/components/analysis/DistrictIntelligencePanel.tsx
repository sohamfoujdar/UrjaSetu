/**
 * DistrictIntelligencePanel.tsx — Deep District Anomaly Intelligence
 * 
 * Displays granular district-level telemetry, severity distributions,
 * anomaly type classifications, a 24-hour baseline vs anomaly load curve,
 * and direct links to active Anomaly Resolution Center cases.
 * 
 * All data is synthetic / simulated based on EXP-URJA DP-FedAvg benchmarks.
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  TrendingUp,
  FolderOpen,
  X,
  UserCheck,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import {
  caseStore,
} from '../../services/caseStore';
import { TIER_CONFIG, type AnomalyTier } from '../../constants/supportedStates';

interface DistrictStats {
  n: number;
  flagged: number;
  trueAnomalies: number;
  avgScore: number;
}

interface DistrictIntelligencePanelProps {
  districtName: string;
  stateName: string;
  districtStats: DistrictStats;
  tier: AnomalyTier;
  onClose: () => void;
  onOpenCase: (caseId: string) => void;
}

export const DistrictIntelligencePanel: React.FC<DistrictIntelligencePanelProps> = ({
  districtName,
  stateName,
  districtStats,
  tier,
  onClose,
  onOpenCase,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Retrieve or seed deterministic cases for this district
  const districtCases = useMemo(() => {
    return caseStore.getDistrictCases(stateName, districtName, districtStats);
  }, [stateName, districtName, districtStats]);

  // Derived Severity Distribution counts
  const severityDist = useMemo(() => {
    const high = districtCases.filter((c) => c.score >= 0.7).length;
    const med = districtCases.filter((c) => c.score >= 0.4 && c.score < 0.7).length;
    const low = districtCases.filter((c) => c.score < 0.4).length;
    const total = districtCases.length || 1;

    return {
      high,
      med,
      low,
      highPct: (high / total) * 100,
      medPct: (med / total) * 100,
      lowPct: (low / total) * 100,
    };
  }, [districtCases]);

  // Derived Anomaly Types counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    districtCases.forEach((c) => {
      const t = c.anomalyType || 'Unusual Pattern';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [districtCases]);

  const availableTypes = useMemo(() => Object.keys(typeCounts), [typeCounts]);

  // Filtered cases
  const filteredCases = useMemo(() => {
    return districtCases.filter((c) => {
      if (severityFilter === 'HIGH' && c.score < 0.7) return false;
      if (severityFilter === 'MEDIUM' && (c.score < 0.4 || c.score >= 0.7)) return false;
      if (severityFilter === 'LOW' && c.score >= 0.4) return false;
      if (typeFilter !== 'ALL' && c.anomalyType !== typeFilter) return false;
      return true;
    });
  }, [districtCases, severityFilter, typeFilter]);

  // 24-hour Trend Profile: baseline vs anomaly load curve
  const trendProfile = useMemo(() => {
    // Generate standard baseline dual-peak profile
    const hours = Array.from({ length: 24 }, (_, h) => h);
    
    // Hash district name for deterministic trend curve
    let hash = 0;
    for (let i = 0; i < districtName.length; i++) {
      hash = ((hash << 5) - hash + districtName.charCodeAt(i)) | 0;
    }
    const seed = Math.abs(hash);

    const isNightSpike = seed % 3 === 0;
    const isMiddayPeak = seed % 3 === 1;

    const data = hours.map((h) => {
      // Normal baseline
      let base = 0.35 + 0.15 * Math.sin((h / 24) * Math.PI * 2 - Math.PI / 2);
      if (h >= 9 && h <= 12) base += 0.28;
      if (h >= 19 && h <= 22) base += 0.32;
      base += (((seed + h * 3) % 10) - 5) / 100;
      base = Math.max(0.15, Math.min(0.9, base));

      // Anomalous flagged curve
      let anom = base;
      if (isNightSpike && h >= 1 && h <= 5) {
        anom = Math.min(1.0, base + 0.45); // Night surge
      } else if (isMiddayPeak && h >= 13 && h <= 17) {
        anom = Math.min(1.0, base + 0.38); // Afternoon surge
      } else if (!isNightSpike && !isMiddayPeak && h >= 10 && h <= 18) {
        anom = Math.max(0.08, base * 0.35); // Daytime drop / bypass
      } else {
        anom = base + (((seed + h * 5) % 8) - 4) / 100;
      }
      anom = Math.max(0.05, Math.min(1.0, anom));

      return { hour: h, base, anom };
    });

    const primaryDivergence = isNightSpike
      ? 'Off-Peak Night Surge (01:00 - 05:00)'
      : isMiddayPeak
      ? 'Peak Load Surge (13:00 - 17:00)'
      : 'Daytime Load Drop / Bypass (10:00 - 18:00)';

    return { data, primaryDivergence };
  }, [districtName]);

  const tierStyle = TIER_CONFIG[tier] || TIER_CONFIG.unknown;
  const flaggedPct = districtStats.n > 0 ? (districtStats.flagged / districtStats.n) * 100 : 0;
  const trueAnomalyPct = districtStats.n > 0 ? (districtStats.trueAnomalies / districtStats.n) * 100 : 0;

  // Chart dimensions
  const CHART_W = 480;
  const CHART_H = 120;
  const PADDING_LEFT = 30;
  const PADDING_RIGHT = 15;
  const PADDING_TOP = 15;
  const PADDING_BOTTOM = 22;
  const PLOT_W = CHART_W - PADDING_LEFT - PADDING_RIGHT;
  const PLOT_H = CHART_H - PADDING_TOP - PADDING_BOTTOM;

  const pointsBase = trendProfile.data.map((d, i) => {
    const x = PADDING_LEFT + (i / 23) * PLOT_W;
    const y = PADDING_TOP + PLOT_H - d.base * PLOT_H;
    return `${x},${y}`;
  }).join(' ');

  const pointsAnom = trendProfile.data.map((d, i) => {
    const x = PADDING_LEFT + (i / 23) * PLOT_W;
    const y = PADDING_TOP + PLOT_H - d.anom * PLOT_H;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex flex-col h-full bg-[#0A1422] rounded-lg border border-[#14263D] overflow-hidden text-slate-100">

      {/* ── Header ── */}
      <div className="p-3.5 bg-[#050B14] border-b border-[#14263D] flex items-start justify-between gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-[#38BDF8] hover:underline"
            >
              <ArrowLeft className="w-3 h-3" />
              All Districts
            </button>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] font-mono text-slate-400">{stateName}</span>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold border ${tierStyle.badgeBg} ${tierStyle.badgeBorder} ${tierStyle.badgeText}`}
            >
              {tierStyle.label} Risk Tier
            </span>
          </div>

          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span>{districtName}</span>
            <span className="text-xs font-normal text-slate-400 font-sans">District Intelligence</span>
          </h2>

          <div className="mt-1 text-[10px] font-mono text-slate-500">
            DP-FedAvg Telemetry Stream • DISCOM Circle Diagnostics (Simulated)
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#14263D] transition-colors"
          title="Close district panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* 1. Core Anomaly Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-lg bg-[#050B14] border border-[#14263D]">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Meters Sampled</div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{districtStats.n}</div>
            <div className="text-[10px] text-slate-500 font-mono">Stream clients</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#050B14] border border-red-500/30">
            <div className="text-[10px] font-mono text-red-400 uppercase tracking-wider">Flagged Meters</div>
            <div className="text-lg font-bold font-mono text-red-400 mt-0.5">
              {districtStats.flagged} <span className="text-xs font-normal text-slate-400">({flaggedPct.toFixed(1)}%)</span>
            </div>
            <div className="text-[10px] text-red-400/70 font-mono">Top 15% cutoff</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#050B14] border border-[#F59E0B]/30">
            <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">True Anomalies</div>
            <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
              {districtStats.trueAnomalies} <span className="text-xs font-normal text-slate-400">({trueAnomalyPct.toFixed(1)}%)</span>
            </div>
            <div className="text-[10px] text-amber-400/70 font-mono">Verified label</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#050B14] border border-[#38BDF8]/30">
            <div className="text-[10px] font-mono text-[#38BDF8] uppercase tracking-wider">Mean Anomaly Score</div>
            <div className="text-lg font-bold font-mono text-[#38BDF8] mt-0.5">
              {(districtStats.avgScore * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Score: {districtStats.avgScore.toFixed(3)}</div>
          </div>
        </div>

        {/* 2. Severity Distribution Bar */}
        <div className="p-3 rounded-lg bg-[#050B14] border border-[#14263D] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300 font-semibold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
              Severity Distribution
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {districtCases.length} active cases
            </span>
          </div>

          {/* Tri-color progress bar */}
          <div className="h-2 w-full rounded-full bg-[#14263D] overflow-hidden flex">
            {severityDist.high > 0 && (
              <div
                className="bg-red-500 h-full transition-all duration-300"
                style={{ width: `${severityDist.highPct}%` }}
                title={`High: ${severityDist.high} (${severityDist.highPct.toFixed(0)}%)`}
              />
            )}
            {severityDist.med > 0 && (
              <div
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${severityDist.medPct}%` }}
                title={`Medium: ${severityDist.med} (${severityDist.medPct.toFixed(0)}%)`}
              />
            )}
            {severityDist.low > 0 && (
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${severityDist.lowPct}%` }}
                title={`Low: ${severityDist.low} (${severityDist.lowPct.toFixed(0)}%)`}
              />
            )}
          </div>

          {/* Chips */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
            <div className="p-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-300">
              <span className="text-[10px] text-slate-400 block">HIGH (≥70%)</span>
              <strong>{severityDist.high}</strong> ({severityDist.highPct.toFixed(0)}%)
            </div>
            <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
              <span className="text-[10px] text-slate-400 block">MED (40-69%)</span>
              <strong>{severityDist.med}</strong> ({severityDist.medPct.toFixed(0)}%)
            </div>
            <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <span className="text-[10px] text-slate-400 block">LOW (&lt;40%)</span>
              <strong>{severityDist.low}</strong> ({severityDist.lowPct.toFixed(0)}%)
            </div>
          </div>
        </div>

        {/* 3. 24-Hour Load & Anomaly Trend Chart */}
        <div className="p-3 rounded-lg bg-[#050B14] border border-[#14263D] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300 font-semibold flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#38BDF8]" />
              District 24-Hour Consumption & Anomaly Profile
            </span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-[#38BDF8]">
                <span className="w-2.5 h-0.5 bg-[#38BDF8] inline-block" />
                Normal Baseline
              </span>
              <span className="flex items-center gap-1 text-[#EF4444]">
                <span className="w-2.5 h-0.5 bg-[#EF4444] border-dashed inline-block" />
                Flagged Anomaly
              </span>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative w-full overflow-hidden">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-32">
              <defs>
                <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="anomGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                const y = PADDING_TOP + PLOT_H - frac * PLOT_H;
                return (
                  <g key={frac}>
                    <line
                      x1={PADDING_LEFT}
                      y1={y}
                      x2={CHART_W - PADDING_RIGHT}
                      y2={y}
                      stroke="#14263D"
                      strokeWidth={0.8}
                      strokeDasharray="2,2"
                    />
                    <text
                      x={PADDING_LEFT - 6}
                      y={y + 3}
                      fontSize="7"
                      fill="#475569"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {(frac * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}

              {/* Baseline Area & Line */}
              <polygon
                points={`${PADDING_LEFT},${PADDING_TOP + PLOT_H} ${pointsBase} ${PADDING_LEFT + PLOT_W},${PADDING_TOP + PLOT_H}`}
                fill="url(#baseGrad)"
              />
              <polyline
                points={pointsBase}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Anomalous Line */}
              <polyline
                points={pointsAnom}
                fill="none"
                stroke="#EF4444"
                strokeWidth={2}
                strokeDasharray="4,2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* X-Axis Hour Labels */}
              {[0, 4, 8, 12, 16, 20, 23].map((h) => {
                const x = PADDING_LEFT + (h / 23) * PLOT_W;
                return (
                  <text
                    key={h}
                    x={x}
                    y={CHART_H - 4}
                    fontSize="7.5"
                    fill="#64748B"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {h}:00
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 bg-[#0A1626] p-2 rounded border border-[#14263D]">
            <span className="text-slate-300">
              Primary Anomaly Pattern: <strong className="text-amber-400">{trendProfile.primaryDivergence}</strong>
            </span>
            <span className="text-slate-500 text-[10px]">24-Hour Telemetry Cycle</span>
          </div>
        </div>

        {/* 4. Anomaly Types Breakdown */}
        <div className="p-3 rounded-lg bg-[#050B14] border border-[#14263D] space-y-2">
          <div className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
            Anomaly Classifications in {districtName}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {Object.entries(typeCounts).map(([type, count]) => (
              <div
                key={type}
                className="p-2 rounded bg-[#0A1422] border border-[#14263D] flex items-center justify-between"
              >
                <span className="text-slate-300 text-[11px] truncate">{type}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                  {count} case{count > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Connected Cases (Resolution Center Integration) */}
        <div className="p-3 rounded-lg bg-[#050B14] border border-[#14263D] space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-[#38BDF8]" />
                Connected Anomaly Cases ({filteredCases.length})
              </div>
              <p className="text-[10px] text-slate-500">
                Click any case to inspect in the Anomaly Resolution Center drawer
              </p>
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1">
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                    severityFilter === sev
                      ? 'bg-[#38BDF8] text-black font-bold border-[#38BDF8]'
                      : 'bg-[#0A1422] border-[#14263D] text-slate-400 hover:text-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Anomaly Type Filter Dropdown if multiple types */}
          {availableTypes.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] font-mono text-slate-400">Classification:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-[11px] bg-[#0A1422] border border-[#14263D] text-slate-200 rounded px-2 py-1 outline-none focus:border-[#38BDF8]"
              >
                <option value="ALL">All Classifications</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t} ({typeCounts[t]})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cases List */}
          <div className="space-y-2">
            {filteredCases.length === 0 ? (
              <div className="p-4 rounded-lg bg-[#0A1422] text-center text-xs text-slate-500 font-mono">
                No cases match the active severity/type filters.
              </div>
            ) : (
              filteredCases.map((c) => {
                const isHigh = c.score >= 0.7;
                const isMed = c.score >= 0.4 && c.score < 0.7;
                const completedRecs = c.recommendations.filter((r) => r.completed).length;

                return (
                  <div
                    key={c.caseId}
                    onClick={() => onOpenCase(c.caseId)}
                    className="p-3 rounded-lg bg-[#0A1422] border border-[#14263D] hover:border-[#38BDF8]/40 hover:bg-[#0E2036] transition-all cursor-pointer group space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#38BDF8] group-hover:underline">
                          {c.caseId}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{c.meterId}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            isHigh
                              ? 'bg-red-500/15 border-red-500/40 text-red-300'
                              : isMed
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          }`}
                        >
                          {(c.score * 100).toFixed(1)}% {isHigh ? 'HIGH' : isMed ? 'MED' : 'LOW'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span className="text-[11px] font-medium text-slate-200 truncate flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-[#38BDF8] flex-shrink-0" />
                        {c.anomalyType}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          c.status === 'Resolved'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : c.status === 'Under Review'
                            ? 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-[#14263D]">
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-slate-400" />
                        {c.assignee?.split(' ')[0] ?? 'Unassigned'}
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">{completedRecs}/{c.recommendations.length} recs</span>
                      </span>
                      <span className="text-[#38BDF8] group-hover:underline flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" /> Open Drawer & Resolution Plan →
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom space */}
        <div className="h-2" />
      </div>
    </div>
  );
};
