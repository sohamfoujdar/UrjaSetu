
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Play, Pause, BarChart3, FolderOpen } from 'lucide-react';
import { METER_FIXTURE } from '../../data/meterFixture';
import {
  detectAnomalies,
  exportAnomalyResults,
} from '../../services/anomalyDetection';
import { caseStore } from '../../services/caseStore';
import { AnomalyResolutionDrawer } from '../resolution/AnomalyResolutionDrawer';
import streamReplayData from '../../data/streamReplay.json';

interface StreamRecord {
  id: number;
  region: string;
  label: number;
  score: number;
  hourly_load: number[];
}

interface StreamReplayData {
  metadata: {
    total_test_samples: number;
    seed: number;
    total_rounds: number;
    dp_sigma: number;
    l2_clip_norm: number;
  };
  metrics: {
    roc_auc: number;
  };
  stream: StreamRecord[];
}

const streamData = streamReplayData as StreamReplayData;

// Seeded RNG using mulberry32
function mulberry32(a: number): () => number {
  return function() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seeded RNG
function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const rng = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Error Boundary component
interface MeterIntelligenceErrorBoundaryState {
  hasError: boolean;
}

class MeterIntelligenceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  MeterIntelligenceErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-[#050B14] text-slate-100 p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Something went wrong loading this page</h2>
            <p className="text-slate-400">Please refresh and try again.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const MeterIntelligencePageContent: React.FC<{ onNavigateToInvestigations?: () => void }> = ({ onNavigateToInvestigations }) => {
  const [search, setSearch] = useState('');
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const openCaseForRecord = (record: { id: number; region: string; score: number; label: number; hourly_load: number[] }) => {
    const c = caseStore.openCase(record);
    setOpenCaseId(c.caseId);
  };
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Shuffle stream records once with seeded shuffle (seed=42)
  const shuffledStream = useMemo(
    () => shuffleWithSeed(streamData?.stream ?? [], 42),
    []
  );

  // Live Grid Monitor state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedRecords, setFeedRecords] = useState<StreamRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<StreamRecord | null>(null);
  const [regionCounts, setRegionCounts] = useState<Record<string, { high: number; total: number }>>({
    NR: { high: 0, total: 0 },
    WR: { high: 0, total: 0 },
    SR: { high: 0, total: 0 },
    ER: { high: 0, total: 0 },
    NER: { high: 0, total: 0 },
  });
  const [anomalyRateHistory, setAnomalyRateHistory] = useState<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  const totalRecords = shuffledStream?.length ?? 0;

  // Playback control
  useEffect(() => {
    if (isPlaying && currentIndex < totalRecords) {
      const baseInterval = 1500; // 1.5 seconds
      const interval = baseInterval / playbackSpeed;
      
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= totalRecords - 1) {
            setIsPlaying(false);
            return prev;
          }
          
          const nextRecord = shuffledStream?.[prev];
          
          if (!nextRecord) {
            return prev;
          }
          
          // Add to feed (newest on top, max 20)
          setFeedRecords((prevFeed) => [nextRecord, ...prevFeed].slice(0, 20));
          
          // Update region counts
          setRegionCounts((prevCounts) => {
            const newCounts = { ...prevCounts };
            const region = nextRecord.region as keyof typeof newCounts;
            const isHigh = nextRecord.score >= 0.7;
            
            newCounts[region] = {
              high: prevCounts[region].high + (isHigh ? 1 : 0),
              total: prevCounts[region].total + 1,
            };
            
            return newCounts;
          });
          
          // Update anomaly rate history (rolling window of last 50)
          setAnomalyRateHistory((prevHistory) => {
            const recentRecords = (shuffledStream ?? []).slice(Math.max(0, prev - 49), prev + 1);
            const anomalyCount = recentRecords.filter(r => r.score >= 0.7).length;
            const rate = recentRecords.length > 0 ? anomalyCount / recentRecords.length : 0;
            return [...prevHistory, rate].slice(-100); // Keep last 100 points
          });
          
          return prev + 1;
        });
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, currentIndex, playbackSpeed, totalRecords, shuffledStream]);

  const togglePlayback = () => {
    if (currentIndex >= totalRecords - 1) {
      // Reset if at end
      setCurrentIndex(0);
      setFeedRecords([]);
      setRegionCounts({
        NR: { high: 0, total: 0 },
        WR: { high: 0, total: 0 },
        SR: { high: 0, total: 0 },
        ER: { high: 0, total: 0 },
        NER: { high: 0, total: 0 },
      });
      setAnomalyRateHistory([]);
    }
    setIsPlaying(!isPlaying);
  };

  const cycleSpeed = () => {
    setPlaybackSpeed((prev) => {
      if (prev === 1) return 2;
      if (prev === 2) return 4;
      return 1;
    });
  };

  const getRiskBadge = (score: number) => {
    if (score >= 0.7) return { label: 'High', color: 'bg-red-500/20 text-red-300 border-red-500/40' };
    if (score >= 0.4) return { label: 'Medium', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    return { label: 'Low', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  };

  const getRegionName = (code: string) => {
    const names: Record<string, string> = {
      NR: 'Northern',
      WR: 'Western',
      SR: 'Southern',
      ER: 'Eastern',
      NER: 'North-Eastern',
    };
    return names[code] || code;
  };

  const results = useMemo(
    () => detectAnomalies(METER_FIXTURE),
    [],
  );

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();

    return results.filter((item) => {
      const matchesSearch =
        !query ||
        item.meterId.toLowerCase().includes(query) ||
        item.clientId.toLowerCase().includes(query) ||
        item.region.toLowerCase().includes(query);

      const matchesCategory =
        categoryFilter === 'all' ||
        item.category === categoryFilter ||
        item.qualityStatus === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [results, search, categoryFilter]);

  const anomalyCount = results.filter(
    (item) =>
      item.category === 'high-consumption' ||
      item.category === 'low-consumption',
  ).length;

  const invalidCount = results.filter(
    (item) => item.qualityStatus !== 'valid',
  ).length;

  const meterCount = new Set(
    results.map((item) => item.meterId),
  ).size;

  function downloadResults() {
    const blob = new Blob(
      [exportAnomalyResults(results)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'meter-anomaly-results.json';
    link.click();

    URL.revokeObjectURL(url);
  }

  function formatTimestamp(timestamp: string) {
    return new Date(timestamp).toLocaleString();
  }

  function categoryLabel(category: string) {
    return category.replaceAll('-', ' ');
  }

  return (
    <>
    <div className="h-full overflow-y-auto bg-[#050B14] p-5 text-slate-100 md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              URJASETU / ANOMALY
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              Anomaly Intelligence
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Smart-meter telemetry, data quality and anomaly detection.
            </p>
          </div>

          <button
            onClick={downloadResults}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/20"
          >
            Export JSON
          </button>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-300">
            Demo data — simulated
          </p>
          <p className="mt-1 text-sm text-slate-400">
            The Live Grid Monitor and Threshold Explorer use held-out test samples scored by our simulated DP-FedAvg model. The Meter readings table below is separate demo data scored with a simple statistical baseline. An anomaly is a signal for investigation, not proof of theft.
          </p>
        </div>

        {/* Live Grid Monitor Section */}
        <section className="rounded-xl border border-[#38BDF8]/30 bg-[#071324] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white font-display">Live Grid Monitor</h2>
              <p className="mt-1 text-sm text-slate-400">
                Simulated real-time replay of the held-out test stream. Scores from our trained DP-FedAvg model.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={cycleSpeed}
                className="px-3 py-2 rounded-lg bg-[#0A1422] border border-[#14243A] text-sm font-mono text-slate-300 hover:bg-[#0E2036] transition-colors"
              >
                {playbackSpeed}x
              </button>
              
              <button
                onClick={togglePlayback}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#38BDF8] hover:bg-[#0EA5E9] text-white font-medium transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>{currentIndex >= totalRecords - 1 ? 'Restart' : 'Play'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress Counter */}
          <div className="mb-4 p-3 rounded-lg bg-[#0A1422] border border-[#14243A]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Stream Progress:</span>
              <span className="font-mono font-bold text-[#B8FF65]">
                {currentIndex} / {totalRecords}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#050B14] overflow-hidden">
              <div 
                className="h-full bg-[#38BDF8] transition-all duration-300"
                style={{ width: `${(currentIndex / totalRecords) * 100}%` }}
              />
            </div>
          </div>

          {/* Region Counts and Anomaly Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Region Statistics */}
            <div className="p-4 rounded-lg bg-[#0A1422] border border-[#14243A]">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#38BDF8]" />
                Regional Anomaly Counts
              </h3>
              <div className="space-y-2">
                {Object.entries(regionCounts).map(([region, counts]) => (
                  <div key={region} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 w-24">{getRegionName(region)}</span>
                    <div className="flex-1 mx-3 h-1.5 rounded-full bg-[#050B14] overflow-hidden">
                      <div 
                        className="h-full bg-red-500"
                        style={{ 
                          width: counts.total > 0 ? `${(counts.high / counts.total) * 100}%` : '0%' 
                        }}
                      />
                    </div>
                    <span className="font-mono text-slate-300 w-20 text-right">
                      {counts.high} / {counts.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rolling Anomaly Rate Chart */}
            <div className="p-4 rounded-lg bg-[#0A1422] border border-[#14243A]">
              <h3 className="text-sm font-semibold text-white mb-3">Rolling Anomaly Rate (Last 50)</h3>
              {anomalyRateHistory.length > 0 ? (
                <div className="relative h-32">
                  <svg viewBox="0 0 400 100" className="w-full h-full">
                    {/* Grid lines */}
                    <line x1="0" y1="100" x2="400" y2="100" stroke="#14243A" strokeWidth="1" />
                    <line x1="0" y1="75" x2="400" y2="75" stroke="#14243A" strokeWidth="1" strokeDasharray="2,2" />
                    <line x1="0" y1="50" x2="400" y2="50" stroke="#14243A" strokeWidth="1" strokeDasharray="2,2" />
                    <line x1="0" y1="25" x2="400" y2="25" stroke="#14243A" strokeWidth="1" strokeDasharray="2,2" />
                    <line x1="0" y1="0" x2="400" y2="0" stroke="#14243A" strokeWidth="1" />
                    
                    {/* Line chart */}
                    {anomalyRateHistory.length > 1 && (
                      <polyline
                        points={anomalyRateHistory.map((rate, i) => {
                          const x = (i / (anomalyRateHistory.length - 1)) * 400;
                          const y = 100 - (rate * 100);
                          return `${x},${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="2"
                      />
                    )}
                  </svg>
                  <div className="absolute top-0 right-0 text-[10px] font-mono text-slate-500">100%</div>
                  <div className="absolute bottom-0 right-0 text-[10px] font-mono text-slate-500">0%</div>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-xs text-slate-500">
                  Start playback to see live anomaly rate
                </div>
              )}
            </div>
          </div>

          {/* Scrolling Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Feed */}
            <div className="rounded-lg bg-[#0A1422] border border-[#14243A] overflow-hidden">
              <div className="p-3 border-b border-[#14243A] bg-[#050B14]">
                <h3 className="text-sm font-semibold text-white">Recent Detections</h3>
                <p className="text-xs text-slate-500 mt-1">Latest {Math.min(feedRecords.length, 20)} samples (newest on top)</p>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {feedRecords.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No records yet. Press Play to start the stream.
                  </div>
                ) : (
                  <div className="divide-y divide-[#14243A]">
                    {feedRecords.map((record) => {
                      const badge = getRiskBadge(record.score);
                      return (
                        <div
                          key={record.id}
                          className="w-full p-3 hover:bg-[#0E2036] transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => setSelectedRecord(record)}
                              className="flex items-center gap-3 flex-1 text-left"
                            >
                              <span className="font-mono text-xs text-slate-400 w-16">
                                #{record.id}
                              </span>
                              <span className="text-xs text-slate-300 w-20">
                                {getRegionName(record.region)}
                              </span>
                              <span className="font-mono text-sm font-bold text-white">
                                {(record.score * 100).toFixed(1)}%
                              </span>
                            </button>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium border ${badge.color}`}>
                                {badge.label}
                              </span>
                              <button
                                onClick={() => openCaseForRecord(record)}
                                title="Open case in Resolution Center"
                                className="p-1 rounded text-slate-500 hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-colors"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Load Curve Detail */}
            <div className="rounded-lg bg-[#0A1422] border border-[#14243A] overflow-hidden">
              <div className="p-3 border-b border-[#14243A] bg-[#050B14]">
                <h3 className="text-sm font-semibold text-white">24-Hour Load Profile</h3>
                <p className="text-xs text-slate-500 mt-1">Click a record to view its hourly consumption</p>
              </div>
              <div className="p-4">
                {selectedRecord ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-slate-400">Sample ID:</span>
                        <span className="ml-2 font-mono text-white">#{selectedRecord.id}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Region:</span>
                        <span className="ml-2 text-[#38BDF8] font-medium">{getRegionName(selectedRecord.region)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-slate-400">True Label:</span>
                        <span className={`ml-2 font-semibold ${selectedRecord.label === 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {selectedRecord.label === 1 ? 'Anomaly' : 'Normal'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Score:</span>
                        <span className="ml-2 font-mono font-bold text-white">{(selectedRecord.score * 100).toFixed(2)}%</span>
                      </div>
                    </div>

                    {/* Bar chart */}
                    <div className="relative h-48 mt-4">
                      <svg viewBox="0 0 480 150" className="w-full h-full">
                        {/* Grid */}
                        <line x1="40" y1="130" x2="460" y2="130" stroke="#14243A" strokeWidth="1" />
                        
                        {/* Bars */}
                        {selectedRecord.hourly_load.map((value, hour) => {
                          const x = 40 + (hour * 17.5);
                          const barHeight = value * 120;
                          const y = 130 - barHeight;
                          return (
                            <rect
                              key={hour}
                              x={x}
                              y={y}
                              width="14"
                              height={barHeight}
                              fill="#38BDF8"
                              opacity="0.8"
                            />
                          );
                        })}
                        
                        {/* Hour labels (every 4 hours) */}
                        {[0, 4, 8, 12, 16, 20].map((hour) => (
                          <text
                            key={hour}
                            x={40 + (hour * 17.5) + 7}
                            y="145"
                            fontSize="10"
                            fill="#64748b"
                            textAnchor="middle"
                          >
                            {hour}h
                          </text>
                        ))}
                      </svg>
                    </div>

                    <div className="text-xs text-slate-500 text-center">
                      Normalized hourly load (0-1 scale)
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-slate-500">
                    Select a record from the feed to view its load profile
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Model Info Footer */}
          <div className="mt-4 p-3 rounded-lg bg-[#0A1422]/50 border border-[#14243A] text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Model: DP-FedAvg</span>
              <span>•</span>
              <span>Rounds: {streamData?.metadata?.total_rounds ?? 'N/A'}</span>
              <span>•</span>
              <span>Sigma: {streamData?.metadata?.dp_sigma ?? 'N/A'}</span>
              <span>•</span>
              <span>Clip: {streamData?.metadata?.l2_clip_norm ?? 'N/A'}</span>
              <span>•</span>
              <span>Test ROC-AUC: {streamData?.metrics?.roc_auc ? (streamData.metrics.roc_auc * 100).toFixed(2) : 'N/A'}%</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total readings" value={results.length} />
          <StatCard title="Meters monitored" value={meterCount} />
          <StatCard title="Anomaly flags" value={anomalyCount} />
          <StatCard title="Data quality issues" value={invalidCount} />
        </div>

        <section className="rounded-xl border border-slate-800 bg-[#0A1220] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold">Meter readings</h2>
              <p className="mt-1 text-sm text-slate-400">
                Search readings and inspect the evidence behind each flag.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search meter, client or region..."
                className="min-w-0 rounded-lg border border-slate-700 bg-[#050B14] px-3 py-2 text-sm outline-none focus:border-cyan-500 sm:w-72"
              />

              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-lg border border-slate-700 bg-[#050B14] px-3 py-2 text-sm capitalize outline-none focus:border-cyan-500"
              >
                <option value="all">All categories</option>
                <option value="normal">Normal</option>
                <option value="high-consumption">High consumption</option>
                <option value="low-consumption">Low consumption</option>
                <option value="insufficient-data">Insufficient data</option>
                <option value="missing">Missing reading</option>
                <option value="duplicate">Duplicate timestamp</option>
                <option value="invalid">Invalid reading</option>
                <option value="inconsistent-unit">Inconsistent unit</option>
              </select>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Meter / Client</th>
                  <th className="px-3 py-3">Timestamp</th>
                  <th className="px-3 py-3">Consumption</th>
                  <th className="px-3 py-3">Quality</th>
                  <th className="px-3 py-3">Anomaly score</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Evidence</th>
                  <th className="px-3 py-3">Case</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/80">
                {filteredResults.map((item, index) => (
                  <tr
                    key={`${item.meterId}-${item.timestamp}-${index}`}
                    className="align-top hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-4">
                      <p className="font-semibold text-slate-200">
                        {item.meterId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.clientId} · {item.region}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-3 py-4 text-slate-400">
                      {formatTimestamp(item.timestamp)}
                    </td>

                    <td className="px-3 py-4 font-medium">
                      {item.consumption === null
                        ? '—'
                        : `${item.consumption} ${item.unit}`}
                    </td>

                    <td className="px-3 py-4">
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-xs capitalize text-slate-300">
                        {categoryLabel(item.qualityStatus)}
                      </span>
                    </td>

                    <td className="px-3 py-4">
                      {item.anomalyScore === null
                        ? '—'
                        : item.anomalyScore.toFixed(2)}
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs capitalize ${
                          item.category === 'high-consumption' ||
                          item.category === 'low-consumption'
                            ? 'bg-rose-500/10 text-rose-300'
                            : item.category === 'normal'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {categoryLabel(item.category)}
                      </span>
                    </td>

                    <td className="max-w-xs px-3 py-4 text-xs text-slate-400">
                      {item.evidence.length > 0
                        ? item.evidence.map((evidence) => (
                            <p key={evidence.code} className="mb-1">
                              {evidence.message}
                            </p>
                          ))
                        : item.category === 'insufficient-data'
                          ? 'Not enough previous readings to score.'
                          : 'No anomaly evidence.'}
                      {item.evidence.some(
                        (evidence) => evidence.expectedValue !== null,
                      ) && (
                        <p className="mt-2 text-slate-500">
                          Expected baseline:{' '}
                          {item.evidence
                            .find((evidence) => evidence.expectedValue !== null)
                            ?.expectedValue?.toFixed(2)}{' '}
                          kWh
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <button
                        onClick={() => {
                          // Build a synthetic stream-compatible record from the AnomalyResult
                          const syntheticRecord = {
                            id: index + 10000, // offset to avoid collision with stream IDs
                            region: item.region.slice(0, 2).toUpperCase(),
                            score: item.anomalyScore ?? 0,
                            label: (item.category === 'high-consumption' || item.category === 'low-consumption') ? 1 : 0,
                            hourly_load: [],
                          };
                          const c = caseStore.openCase(syntheticRecord);
                          setOpenCaseId(c.caseId);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#38BDF8] border border-[#38BDF8]/30 bg-[#38BDF8]/8 hover:bg-[#38BDF8]/20 transition-colors whitespace-nowrap"
                      >
                        <FolderOpen className="w-3 h-3" />
                        Open Case
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredResults.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">
                No readings match your search or selected category.
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Showing {filteredResults.length} of {results.length} readings ·
            Model version: {results[0]?.modelVersion ?? 'N/A'}
          </p>
        </section>
      </div>
    </div>
    <AnomalyResolutionDrawer
      caseId={openCaseId}
      onClose={() => setOpenCaseId(null)}
      onNavigateToInvestigations={onNavigateToInvestigations}
    />
    </>
  );
};

export const MeterIntelligencePage: React.FC<{ onNavigateToInvestigations?: () => void }> = ({ onNavigateToInvestigations }) => (
  <MeterIntelligenceErrorBoundary>
    <MeterIntelligencePageContent onNavigateToInvestigations={onNavigateToInvestigations} />
  </MeterIntelligenceErrorBoundary>
);

interface StatCardProps {
  title: string;
  value: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value }) => (
  <div className="rounded-xl border border-slate-800 bg-[#0A1220] p-5">
    <p className="text-sm text-slate-400">{title}</p>
    <p className="mt-3 text-3xl font-bold text-slate-100">{value}</p>
  </div>
);
