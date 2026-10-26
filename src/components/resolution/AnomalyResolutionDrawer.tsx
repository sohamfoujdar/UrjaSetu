/**
 * AnonymousResolutionDrawer.tsx — Anomaly Case Detail Drawer
 *
 * Full-featured case management panel that slides in from the right.
 * Shows case details, consumption chart, recommended resolution steps,
 * case workflow actions, notes, and activity timeline.
 *
 * All data is synthetic/simulated. Anomaly scores are investigative
 * signals, not proof of any wrongdoing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  Flag,
  ExternalLink,
  CircleDot,
  Loader2,
  Download,
  Tag,
  Activity,
} from 'lucide-react';
import {
  caseStore,
  AVAILABLE_ASSIGNEES,
  AVAILABLE_TAGS,
  type AnomalyCase,
  type CaseStatus,
  type ResolutionOutcome,
  type RecommendationId,
} from '../../services/caseStore';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Props {
  caseId: string | null;
  onClose: () => void;
  onNavigateToInvestigations?: () => void;
}

// ─────────────────────────────────────────────
// Status metadata
// ─────────────────────────────────────────────

const STATUS_META: Record<CaseStatus, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  'Detected': {
    color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/40',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  'Under Review': {
    color: 'text-[#38BDF8]', bg: 'bg-[#38BDF8]/15', border: 'border-[#38BDF8]/40',
    icon: <Search className="w-3.5 h-3.5" />,
  },
  'Investigation Created': {
    color: 'text-violet-300', bg: 'bg-violet-500/15', border: 'border-violet-500/40',
    icon: <FileText className="w-3.5 h-3.5" />,
  },
  'Awaiting Verification': {
    color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/40',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  'Resolved': {
    color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  'False Alarm': {
    color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/40',
    icon: <CircleDot className="w-3.5 h-3.5" />,
  },
  'Inconclusive': {
    color: 'text-slate-400', bg: 'bg-slate-700/20', border: 'border-slate-600/40',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
};

const TIMELINE_TYPE_COLORS: Record<string, string> = {
  'status-change': 'bg-[#38BDF8]',
  'note': 'bg-amber-400',
  'action': 'bg-[#B8FF65]',
  'investigation': 'bg-violet-400',
  'resolution': 'bg-emerald-400',
};

const RESOLUTION_OUTCOMES: ResolutionOutcome[] = [
  'Meter fault confirmed',
  'Communication error',
  'Normal seasonal variation',
  'Field inspection requested',
  'False positive — no action',
  'Inconclusive — further monitoring',
  'Other',
];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StatusBadge({ status }: { status: CaseStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.color} ${m.bg} ${m.border}`}>
      {m.icon}{status}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = (score * 100).toFixed(1);
  if (score >= 0.7) return <span className="font-mono font-bold text-red-300">{pct}% <span className="text-xs font-normal text-red-400">HIGH</span></span>;
  if (score >= 0.4) return <span className="font-mono font-bold text-amber-300">{pct}% <span className="text-xs font-normal text-amber-400">MEDIUM</span></span>;
  return <span className="font-mono font-bold text-emerald-300">{pct}% <span className="text-xs font-normal text-emerald-400">LOW</span></span>;
}

function Divider() {
  return <div className="h-px bg-[#14263D] my-4" />;
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className="text-[#38BDF8]">{icon}</span>}
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h3>
    </div>
  );
}

// ─────────────────────────────────────────────
// Load chart
// ─────────────────────────────────────────────

function LoadChart({ hourlyLoad }: { hourlyLoad: number[] }) {
  if (!hourlyLoad || hourlyLoad.length === 0) return null;
  const maxVal = Math.max(...hourlyLoad, 0.01);
  const WIDTH = 400;
  const HEIGHT = 80;
  const barW = Math.floor(WIDTH / hourlyLoad.length) - 1;

  return (
    <div className="rounded-lg bg-[#050B14] border border-[#14263D] p-3">
      <div className="text-[10px] font-mono text-slate-500 mb-2">24-HOUR LOAD PROFILE (normalized)</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 14}`} className="w-full h-28">
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={0} y1={HEIGHT - frac * HEIGHT}
            x2={WIDTH} y2={HEIGHT - frac * HEIGHT}
            stroke="#14263D" strokeWidth={0.8}
          />
        ))}
        {hourlyLoad.map((v, i) => {
          const bh = Math.max((v / maxVal) * HEIGHT, 2);
          const fill = v / maxVal >= 0.85 ? '#EF4444' : v / maxVal >= 0.6 ? '#F59E0B' : '#38BDF8';
          return (
            <rect
              key={i}
              x={i * (barW + 1)}
              y={HEIGHT - bh}
              width={barW}
              height={bh}
              fill={fill}
              opacity={0.85}
              rx={1}
            />
          );
        })}
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={(h / 23) * WIDTH} y={HEIGHT + 12} fontSize={8} fill="#475569" textAnchor="middle">
            {h}h
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Drawer
// ─────────────────────────────────────────────

export const AnomalyResolutionDrawer: React.FC<Props> = ({ caseId, onClose, onNavigateToInvestigations }) => {
  const [caseData, setCaseData] = useState<AnomalyCase | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showFalseAlarmModal, setShowFalseAlarmModal] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<ResolutionOutcome>(RESOLUTION_OUTCOMES[0]);
  const [resolutionNote, setResolutionNote] = useState('');
  const [showTimeline, setShowTimeline] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Subscribe to store updates
  useEffect(() => {
    const refresh = () => {
      if (caseId) setCaseData(caseStore.getCase(caseId) ?? null);
    };
    refresh();
    const unsub = caseStore.subscribe(refresh);
    return unsub;
  }, [caseId]);

  const simulateAsync = useCallback((fn: () => void) => {
    setActionLoading(true);
    setTimeout(() => { fn(); setActionLoading(false); }, 350);
  }, []);

  if (!caseId) return null;
  if (!caseData) return (
    <div className="fixed inset-y-0 right-0 w-[520px] bg-[#060E1A] border-l border-[#14263D] flex items-center justify-center z-50">
      <Loader2 className="w-6 h-6 text-[#38BDF8] animate-spin" />
    </div>
  );

  const { status } = caseData;
  const isClosed = status === 'Resolved' || status === 'False Alarm' || status === 'Inconclusive';
  const canReview = status === 'Detected';
  const canInvestigate = !isClosed && status !== 'Investigation Created';
  const canResolve = !isClosed;
  const canReopen = isClosed;

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    simulateAsync(() => {
      caseStore.addNote(caseData.caseId, noteText.trim());
      setNoteText('');
    });
  };

  const handleStartReview = () => simulateAsync(() => caseStore.updateStatus(caseData.caseId, 'Under Review'));
  const handleCreateInvestigation = () => simulateAsync(() => {
    caseStore.createInvestigation(caseData.caseId);
    onNavigateToInvestigations?.();
  });
  const handleAwaitVerification = () => simulateAsync(() => caseStore.updateStatus(caseData.caseId, 'Awaiting Verification'));
  const handleMarkInconclusive = () => simulateAsync(() => caseStore.updateStatus(caseData.caseId, 'Inconclusive'));
  const handleReopen = () => simulateAsync(() => caseStore.reopenCase(caseData.caseId));

  const handleResolve = () => {
    simulateAsync(() => {
      caseStore.resolveCase(caseData.caseId, selectedOutcome, resolutionNote);
      setShowResolveModal(false);
      setResolutionNote('');
    });
  };

  const handleFalseAlarm = () => {
    simulateAsync(() => {
      caseStore.markFalseAlarm(caseData.caseId, resolutionNote);
      setShowFalseAlarmModal(false);
      setResolutionNote('');
    });
  };

  const handleExportCase = () => {
    const jsonStr = caseStore.exportToJson([caseData]);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${caseData.caseId}_resolution_report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-[560px] bg-[#060E1A] border-l border-[#14263D] z-50 flex flex-col shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-start justify-between p-4 border-b border-[#14263D] bg-[#060E1A]/95 backdrop-blur-md">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Anomaly Resolution Center</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 border border-amber-500/25 text-amber-300">
                SIMULATED DATA
              </span>
            </div>
            <h2 className="text-base font-bold font-mono text-slate-100 truncate">{caseData.caseId}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={caseData.status} />
              <span className="text-[10px] font-mono text-slate-500">
                Created {new Date(caseData.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="ml-3 flex-shrink-0 flex items-center gap-1">
            <button
              onClick={handleExportCase}
              className="p-2 rounded-lg text-slate-400 hover:text-[#38BDF8] hover:bg-[#14263D] transition-colors"
              title="Export Case JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#14263D] transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Case Details Grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Meter ID', value: caseData.meterId, mono: true },
                { label: 'Region', value: `${caseData.regionName} (${caseData.region})`, mono: false },
                { label: 'State', value: caseData.state, mono: false },
                { label: 'District', value: caseData.district, mono: false },
              ].map(({ label, value, mono }) => (
                <div key={label} className="p-2.5 rounded-lg bg-[#0A1422] border border-[#14263D]">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">{label}</div>
                  <div className={`text-sm text-slate-200 font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
                </div>
              ))}

              {/* Anomaly Classification & Assignee */}
              <div className="col-span-2 p-2.5 rounded-lg bg-[#0A1422] border border-[#14263D] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Anomaly Classification</div>
                  <div className="text-sm font-semibold text-[#38BDF8] flex items-center gap-1.5 truncate">
                    <Activity className="w-3.5 h-3.5 text-[#38BDF8] flex-shrink-0" />
                    <span className="truncate">{caseData.anomalyType}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Assigned Analyst</div>
                  <select
                    value={caseData.assignee ?? 'Unassigned'}
                    onChange={(e) => caseStore.assignCase(caseData.caseId, e.target.value)}
                    className="text-xs bg-[#050B14] border border-[#14263D] text-slate-200 rounded px-2 py-1 focus:border-[#38BDF8] outline-none"
                  >
                    {AVAILABLE_ASSIGNEES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="col-span-2 p-2.5 rounded-lg bg-[#0A1422] border border-[#14263D]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Tag className="w-3 h-3 text-[#38BDF8]" /> Case Tags
                  </div>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) caseStore.addTag(caseData.caseId, e.target.value);
                    }}
                    className="text-[11px] bg-[#050B14] border border-[#14263D] text-slate-400 rounded px-2 py-0.5 outline-none hover:text-slate-200 cursor-pointer"
                  >
                    <option value="">+ Add Tag...</option>
                    {AVAILABLE_TAGS.filter(t => !caseData.tags?.includes(t)).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {caseData.tags?.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#38BDF8]">
                      {t}
                      <button
                        onClick={() => caseStore.removeTag(caseData.caseId, t)}
                        className="text-slate-400 hover:text-red-400 ml-0.5"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {(!caseData.tags || caseData.tags.length === 0) && (
                    <span className="text-xs text-slate-500 italic">No tags assigned</span>
                  )}
                </div>
              </div>
            </div>

            {/* Score + Label */}
            <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14263D] flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">DP-FedAvg Anomaly Score</div>
                <ScoreBadge score={caseData.score} />
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Dataset Label</div>
                <span className={`text-sm font-semibold ${caseData.groundTruthLabel === 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {caseData.groundTruthLabel === 1 ? 'Anomaly' : 'Normal'} (test set)
                </span>
              </div>
              {caseData.investigationRef && (
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Investigation</div>
                  <span className="text-xs font-mono text-violet-300">{caseData.investigationRef}</span>
                </div>
              )}
            </div>

            {/* Why Flagged */}
            <div className="p-3 rounded-lg bg-[#38BDF8]/5 border border-[#38BDF8]/20">
              <SectionHeader title="Why this was flagged" icon={<ShieldAlert className="w-3.5 h-3.5" />} />
              <p className="text-xs text-slate-300 leading-relaxed">
                This meter's 24-hour load profile was scored by the DP-FedAvg federated model at{' '}
                <span className="font-mono font-bold text-[#38BDF8]">{(caseData.score * 100).toFixed(1)}%</span>.
                {caseData.score >= 0.7
                  ? ' The score exceeds the high-risk threshold (≥70%), indicating a statistically unusual consumption pattern compared to peers in this region.'
                  : caseData.score >= 0.4
                  ? ' The score falls in the medium-risk band (40–70%), suggesting a pattern that differs from the regional baseline but may reflect legitimate seasonal or operational variation.'
                  : ' The score is below the medium-risk threshold (<40%). This case may have been opened for review at a lower threshold setting.'}
                {' '}An anomaly score is an investigative signal, not proof of any wrongdoing.
              </p>
            </div>

            {/* Consumption Chart */}
            {caseData.hourlyLoad && caseData.hourlyLoad.length > 0 && (
              <>
                <SectionHeader title="Consumption History (24h)" />
                <LoadChart hourlyLoad={caseData.hourlyLoad} />
              </>
            )}

            <Divider />

            {/* Recommended Resolution Plan */}
            <div>
              <SectionHeader title="Recommended Resolution Plan" icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
              <div className="space-y-2">
                {caseData.recommendations.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => caseStore.toggleRecommendation(caseData.caseId, rec.id as RecommendationId)}
                    className={`w-full text-left p-3 rounded-lg border transition-all group ${
                      rec.completed
                        ? 'bg-emerald-500/8 border-emerald-500/30'
                        : 'bg-[#0A1422] border-[#14263D] hover:border-[#38BDF8]/30 hover:bg-[#0E1F33]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                        rec.completed
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-slate-600 group-hover:border-[#38BDF8]'
                      }`}>
                        {rec.completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${rec.completed ? 'text-emerald-300 line-through' : 'text-slate-200'}`}>
                          {rec.label}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{rec.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            {/* Case Actions */}
            <div>
              <SectionHeader title="Case Actions" icon={<Flag className="w-3.5 h-3.5" />} />
              <div className="flex flex-wrap gap-2">
                {canReview && (
                  <ActionButton onClick={handleStartReview} loading={actionLoading} variant="primary">
                    <Search className="w-3.5 h-3.5" /> Start Review
                  </ActionButton>
                )}
                {canInvestigate && (
                  <ActionButton onClick={handleCreateInvestigation} loading={actionLoading} variant="secondary">
                    <FileText className="w-3.5 h-3.5" />
                    {caseData.investigationRef ? 'View Investigation' : 'Create Investigation'}
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </ActionButton>
                )}
                {status === 'Under Review' && (
                  <ActionButton onClick={handleAwaitVerification} loading={actionLoading} variant="secondary">
                    <Clock className="w-3.5 h-3.5" /> Await Verification
                  </ActionButton>
                )}
                {!isClosed && (
                  <ActionButton onClick={handleMarkInconclusive} loading={actionLoading} variant="ghost">
                    <CircleDot className="w-3.5 h-3.5" /> Mark Inconclusive
                  </ActionButton>
                )}
                {canResolve && (
                  <ActionButton onClick={() => setShowResolveModal(true)} loading={actionLoading} variant="lime">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Case
                  </ActionButton>
                )}
                {!isClosed && (
                  <ActionButton onClick={() => setShowFalseAlarmModal(true)} loading={actionLoading} variant="ghost">
                    <CircleDot className="w-3.5 h-3.5" /> False Alarm
                  </ActionButton>
                )}
                {canReopen && (
                  <ActionButton onClick={handleReopen} loading={actionLoading} variant="ghost">
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen
                  </ActionButton>
                )}
              </div>
            </div>

            {/* Resolution outcome display */}
            {isClosed && caseData.resolutionOutcome && (
              <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14263D]">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Resolution Outcome</div>
                <div className="text-sm text-slate-200 font-medium">{caseData.resolutionOutcome}</div>
                {caseData.resolutionNote && (
                  <div className="text-xs text-slate-400 mt-1">{caseData.resolutionNote}</div>
                )}
              </div>
            )}

            <Divider />

            {/* Add Note */}
            <div>
              <SectionHeader title="Add Note" icon={<MessageSquare className="w-3.5 h-3.5" />} />
              <div className="flex gap-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Record an observation, corrective action, or follow-up..."
                  rows={3}
                  className="flex-1 text-sm bg-[#0A1422] border border-[#14263D] rounded-lg p-2.5 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-[#38BDF8] transition-colors"
                />
              </div>
              <div className="flex justify-end mt-2">
                <ActionButton onClick={handleAddNote} loading={actionLoading} variant="primary" disabled={!noteText.trim()}>
                  <MessageSquare className="w-3.5 h-3.5" /> Add Note
                </ActionButton>
              </div>

              {/* Existing notes */}
              {caseData.notes.length > 0 && (
                <div className="mt-3 space-y-2">
                  {[...caseData.notes].reverse().map((note) => (
                    <div key={note.id} className="p-2.5 rounded-lg bg-[#0A1422] border border-[#14263D]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-[#38BDF8]">{note.author}</span>
                        <span className="text-[10px] text-slate-500">{new Date(note.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{note.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Timeline */}
            <div>
              <button
                className="flex items-center gap-2 w-full text-left mb-3"
                onClick={() => setShowTimeline(!showTimeline)}
              >
                <SectionHeader title="Activity Timeline" />
                {showTimeline ? <ChevronUp className="w-4 h-4 text-slate-500 ml-auto" /> : <ChevronDown className="w-4 h-4 text-slate-500 ml-auto" />}
              </button>

              {showTimeline && (
                <div className="relative pl-5">
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-[#14263D]" />
                  <div className="space-y-3">
                    {[...caseData.timeline].reverse().map((event) => {
                      const dotColor = TIMELINE_TYPE_COLORS[event.type] ?? 'bg-slate-500';
                      return (
                        <div key={event.id} className="relative">
                          <div className={`absolute -left-[15px] top-1.5 w-2 h-2 rounded-full ${dotColor}`} />
                          <div className="pl-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-medium text-slate-200">{event.label}</span>
                              {event.actor && (
                                <span className="text-[10px] text-[#38BDF8] font-mono">{event.actor}</span>
                              )}
                              <span className="text-[10px] text-slate-600 ml-auto">
                                {new Date(event.timestamp).toLocaleString()}
                              </span>
                            </div>
                            {event.detail && (
                              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{event.detail}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom padding */}
            <div className="h-4" />
          </div>
        </div>
      </div>

      {/* ── Resolve Modal ── */}
      {showResolveModal && (
        <ResolutionModal
          title="Resolve Case"
          description="Select the resolution outcome and add an optional note before closing."
          confirmLabel="Resolve Case"
          confirmVariant="lime"
          outcome={selectedOutcome}
          onOutcomeChange={setSelectedOutcome}
          note={resolutionNote}
          onNoteChange={setResolutionNote}
          onConfirm={handleResolve}
          onCancel={() => { setShowResolveModal(false); setResolutionNote(''); }}
          loading={actionLoading}
          requireOutcome
        />
      )}

      {/* ── False Alarm Modal ── */}
      {showFalseAlarmModal && (
        <ResolutionModal
          title="Mark as False Alarm"
          description="Confirm this was a false positive. Add a note explaining why."
          confirmLabel="Mark False Alarm"
          confirmVariant="ghost"
          outcome={'False positive — no action'}
          onOutcomeChange={() => {}}
          note={resolutionNote}
          onNoteChange={setResolutionNote}
          onConfirm={handleFalseAlarm}
          onCancel={() => { setShowFalseAlarmModal(false); setResolutionNote(''); }}
          loading={actionLoading}
          hideOutcomeSelect
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────
// Resolution Modal
// ─────────────────────────────────────────────

interface ResolutionModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: 'lime' | 'ghost';
  outcome: ResolutionOutcome;
  onOutcomeChange: (o: ResolutionOutcome) => void;
  note: string;
  onNoteChange: (n: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  requireOutcome?: boolean;
  hideOutcomeSelect?: boolean;
}

const ResolutionModal: React.FC<ResolutionModalProps> = ({
  title, description, confirmLabel, confirmVariant,
  outcome, onOutcomeChange, note, onNoteChange,
  onConfirm, onCancel, loading, requireOutcome, hideOutcomeSelect,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative w-full max-w-md rounded-xl bg-[#060E1A] border border-[#14263D] shadow-2xl p-5 space-y-4">
      <h3 className="text-base font-bold text-slate-100">{title}</h3>
      <p className="text-sm text-slate-400">{description}</p>

      {!hideOutcomeSelect && (
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Resolution Outcome</label>
          <select
            value={outcome}
            onChange={(e) => onOutcomeChange(e.target.value as ResolutionOutcome)}
            className="w-full text-sm bg-[#0A1422] border border-[#14263D] rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-[#38BDF8]"
          >
            {RESOLUTION_OUTCOMES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Add context or corrective action taken..."
          rows={3}
          className="w-full text-sm bg-[#0A1422] border border-[#14263D] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-[#38BDF8]"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-[#14263D] hover:bg-[#14263D] transition-colors"
        >
          Cancel
        </button>
        <ActionButton
          onClick={onConfirm}
          loading={loading}
          variant={confirmVariant}
          disabled={requireOutcome && !outcome}
        >
          {confirmLabel}
        </ActionButton>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Generic action button
// ─────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'lime' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, children, variant = 'primary', loading, disabled }) => {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-[#38BDF8] hover:bg-[#38BDF8]/25',
    secondary: 'bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25',
    lime: 'bg-[#B8FF65]/15 border border-[#B8FF65]/40 text-[#B8FF65] hover:bg-[#B8FF65]/25',
    ghost: 'bg-[#0A1422] border border-[#14263D] text-slate-400 hover:text-slate-200 hover:bg-[#14263D]',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  );
};
