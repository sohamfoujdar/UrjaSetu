/**
 * AnomalyResolutionCenter.tsx — Anomaly Resolution Center Hub
 * 
 * Central operational hub for managing, triaging, investigating, and resolving
 * grid anomalies detected by the DP-FedAvg model across Indian states.
 * 
 * Supports:
 * - Filtering & sorting by status, severity, state, anomaly type
 * - Bulk actions (status transitions, analyst reassignments)
 * - Rich case detail drawer with resolution checklist & load chart
 * - Export to JSON / CSV and audit printing
 * - Tab to view stream replay test stream
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  CircleDot,
  Download,
  Printer,
  ArrowUpDown,
  FolderOpen,
  UserCheck,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  caseStore,
  AVAILABLE_ASSIGNEES,
  type AnomalyCase,
  type CaseStatus,
} from '../../services/caseStore';
import { AnomalyResolutionDrawer } from './AnomalyResolutionDrawer';
import streamData from '../../data/streamReplay.json';

const STATUS_OPTIONS: { label: string; value: CaseStatus | 'ALL' }[] = [
  { label: 'All Cases', value: 'ALL' },
  { label: 'Detected', value: 'Detected' },
  { label: 'Under Review', value: 'Under Review' },
  { label: 'Investigation Created', value: 'Investigation Created' },
  { label: 'Awaiting Verification', value: 'Awaiting Verification' },
  { label: 'Resolved', value: 'Resolved' },
  { label: 'False Alarm', value: 'False Alarm' },
];

const SEVERITY_OPTIONS = [
  { label: 'All Severities', value: 'ALL' },
  { label: 'High (≥ 70%)', value: 'HIGH' },
  { label: 'Medium (40-69%)', value: 'MEDIUM' },
  { label: 'Low (< 40%)', value: 'LOW' },
];

export const AnomalyResolutionCenter: React.FC = () => {
  const [cases, setCases] = useState<AnomalyCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'date_asc'>('score_desc');

  // Bulk selection
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<CaseStatus | ''>('');
  const [bulkAssignee, setBulkAssignee] = useState<string>('');

  // Active view tab (Cases vs Stream Replay)
  const [activeTab, setActiveTab] = useState<'cases' | 'stream'>('cases');

  // Subscribe to case store updates
  useEffect(() => {
    const updateCases = () => setCases(caseStore.getCases());
    updateCases();
    const unsub = caseStore.subscribe(updateCases);
    return unsub;
  }, []);

  // Unique states & anomaly types for dropdowns
  const availableStates = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => {
      if (c.state) set.add(c.state);
    });
    return Array.from(set).sort();
  }, [cases]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => {
      if (c.anomalyType) set.add(c.anomalyType);
    });
    return Array.from(set).sort();
  }, [cases]);

  // Filtered & sorted cases
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          c.caseId.toLowerCase().includes(q) ||
          c.meterId.toLowerCase().includes(q) ||
          c.state.toLowerCase().includes(q) ||
          c.district.toLowerCase().includes(q) ||
          c.anomalyType.toLowerCase().includes(q) ||
          (c.assignee && c.assignee.toLowerCase().includes(q)) ||
          c.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Status
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;

      // Severity
      if (severityFilter === 'HIGH' && c.score < 0.7) return false;
      if (severityFilter === 'MEDIUM' && (c.score < 0.4 || c.score >= 0.7)) return false;
      if (severityFilter === 'LOW' && c.score >= 0.4) return false;

      // State
      if (stateFilter !== 'ALL' && c.state !== stateFilter) return false;

      // Anomaly Type
      if (typeFilter !== 'ALL' && c.anomalyType !== typeFilter) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'score_desc') return b.score - a.score;
      if (sortBy === 'score_asc') return a.score - b.score;
      if (sortBy === 'date_desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'date_asc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return 0;
    });
  }, [cases, searchTerm, statusFilter, severityFilter, stateFilter, typeFilter, sortBy]);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedCaseIds.length === filteredCases.length) {
      setSelectedCaseIds([]);
    } else {
      setSelectedCaseIds(filteredCases.map((c) => c.caseId));
    }
  };

  const handleToggleCase = (id: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkStatusApply = () => {
    if (!bulkStatus || selectedCaseIds.length === 0) return;
    caseStore.bulkUpdateStatus(selectedCaseIds, bulkStatus);
    setBulkStatus('');
  };

  const handleBulkAssignApply = () => {
    if (!bulkAssignee || selectedCaseIds.length === 0) return;
    caseStore.bulkAssign(selectedCaseIds, bulkAssignee);
    setBulkAssignee('');
  };

  // Export handlers
  const handleExportJson = () => {
    const jsonStr = caseStore.exportToJson(filteredCases);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urjasetu_resolution_cases_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvStr = caseStore.exportToCsv(filteredCases);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urjasetu_resolution_cases_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Metrics KPI calculations
  const stats = useMemo(() => {
    const total = cases.length;
    const detected = cases.filter((c) => c.status === 'Detected').length;
    const underReview = cases.filter((c) => c.status === 'Under Review').length;
    const investigation = cases.filter((c) => c.status === 'Investigation Created').length;
    const awaiting = cases.filter((c) => c.status === 'Awaiting Verification').length;
    const resolved = cases.filter((c) => c.status === 'Resolved').length;
    const falseAlarm = cases.filter((c) => c.status === 'False Alarm').length;
    const highRisk = cases.filter((c) => c.score >= 0.7).length;

    return {
      total,
      active: detected + underReview + investigation + awaiting,
      underReview,
      investigation,
      resolved,
      falseAlarm,
      highRisk,
      resolutionRate: total > 0 ? ((resolved / total) * 100).toFixed(0) : '0',
    };
  }, [cases]);

  // Raw stream data for secondary tab
  const rawStreamRecords = useMemo(() => {
    const raw: any = streamData;
    const records = (Array.isArray(raw)
      ? raw
      : raw?.records ?? raw?.samples ?? raw?.stream ?? raw?.data ?? []) as Array<{
      id: string | number;
      region: string;
      label: number;
      score: number;
    }>;
    return [...records].sort((a, b) => b.score - a.score).slice(0, 25);
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[#050B14] p-5 text-slate-100 md:p-8">
      <div className="mx-auto max-w-[1550px] space-y-6">

        {/* ── Page Header ── */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                Anomaly Resolution Center
              </h1>
              <span className="inline-flex items-center gap-1 rounded border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-semibold text-[#38BDF8]">
                <ShieldAlert className="w-3.5 h-3.5" />
                TRIAGE & WORKFLOWS
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Enterprise case management, investigative review, recommendation checklists, and field resolution workflows.
            </p>
            <div className="mt-2 inline-block rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
              Simulated DISCOM Data. An anomaly score is a signal for investigation, not proof of meter tampering.
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setActiveTab(activeTab === 'cases' ? 'stream' : 'cases')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                activeTab === 'stream'
                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                  : 'bg-[#0E2036] text-slate-300 border-slate-700/60 hover:border-slate-500'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {activeTab === 'stream' ? 'Back to Resolution Hub' : 'Raw Stream Test Set'}
            </button>
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#38BDF8] text-black hover:bg-[#38BDF8]/90 transition-colors shadow-lg shadow-[#38BDF8]/20"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0E2036] text-slate-200 border border-slate-700 hover:border-slate-500 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0E2036] text-slate-300 border border-slate-700 hover:border-slate-500 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>

        {/* ── KPI Stat Cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-[#0B1524] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Total Cases</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-white">{stats.total}</span>
              <span className="text-xs text-slate-500">meters</span>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-[#0B1524] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Active Queue</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-amber-300">{stats.active}</span>
              <span className="text-xs text-amber-400/70">pending</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#38BDF8]/30 bg-[#0B1524] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[#38BDF8]">Under Review</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-[#38BDF8]">{stats.underReview}</span>
              <span className="text-xs text-slate-500">triage</span>
            </div>
          </div>

          <div className="rounded-xl border border-violet-500/30 bg-[#0B1524] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-violet-400">Field Dispatched</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-violet-300">{stats.investigation}</span>
              <span className="text-xs text-slate-500">inspections</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-[#0B1524] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Resolved</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-emerald-300">{stats.resolved}</span>
              <span className="text-xs text-emerald-400/70">{stats.resolutionRate}% rate</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-[#0B1524] p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">False Alarms</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-slate-300">{stats.falseAlarm}</span>
              <span className="text-xs text-slate-500">verified</span>
            </div>
          </div>
        </div>

        {/* ── View Toggle / Main Content ── */}
        {activeTab === 'stream' ? (
          /* Stream Replay Test Set Table */
          <div className="rounded-xl border border-slate-800 bg-[#0B1524] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Held-Out Stream Test Set (Top 25)</h2>
                <p className="text-xs text-slate-400">
                  Pre-computed DP-FedAvg predictions from the 796 test samples generated by our Python FL pipeline.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-[#050B14]/60">
                  <tr>
                    <th className="p-3">Sample ID</th>
                    <th className="p-3">Region</th>
                    <th className="p-3">Model Score</th>
                    <th className="p-3">Test Label</th>
                    <th className="p-3">Resolution Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rawStreamRecords.map((c) => (
                    <tr key={c.id} className="hover:bg-[#0E2036]/50 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-200">SAMPLE-{c.id}</td>
                      <td className="p-3">{c.region}</td>
                      <td className="p-3 font-mono font-bold text-[#B8FF65]">
                        {(c.score * 100).toFixed(1)}%
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          c.label === 1 ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {c.label === 1 ? 'Anomaly (1)' : 'Normal (0)'}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            const newCase = caseStore.openCase({
                              id: Number(c.id),
                              region: c.region,
                              score: c.score,
                              label: c.label,
                              hourly_load: [],
                            });
                            setActiveCaseId(newCase.caseId);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-[#38BDF8] border border-[#38BDF8]/40 bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 transition-colors"
                        >
                          <FolderOpen className="w-3 h-3" />
                          Open Case
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Cases Management Hub */
          <div className="space-y-4">

            {/* Filter and Search Bar */}
            <div className="rounded-xl border border-slate-800 bg-[#0B1524] p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search Case, Meter, State, Assignee..."
                    className="w-full rounded-lg border border-slate-700 bg-[#050B14] py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-[#38BDF8] focus:outline-none transition-colors"
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-700 bg-[#050B14] px-3 py-2 text-xs text-slate-200 focus:border-[#38BDF8] focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Status: {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Severity Filter */}
                <div>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#050B14] px-3 py-2 text-xs text-slate-200 focus:border-[#38BDF8] focus:outline-none"
                  >
                    {SEVERITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Severity: {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* State Filter */}
                <div>
                  <select
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#050B14] px-3 py-2 text-xs text-slate-200 focus:border-[#38BDF8] focus:outline-none"
                  >
                    <option value="ALL">All States ({availableStates.length})</option>
                    {availableStates.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Anomaly Type / Category Filter */}
                <div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#050B14] px-3 py-2 text-xs text-slate-200 focus:border-[#38BDF8] focus:outline-none"
                  >
                    <option value="ALL">All Classifications ({availableTypes.length})</option>
                    {availableTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sort & Quick summary row */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span>Showing <strong className="text-white font-mono">{filteredCases.length}</strong> of {cases.length} cases</span>
                  {(searchTerm || statusFilter !== 'ALL' || severityFilter !== 'ALL' || stateFilter !== 'ALL' || typeFilter !== 'ALL') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setStatusFilter('ALL');
                        setSeverityFilter('ALL');
                        setStateFilter('ALL');
                        setTypeFilter('ALL');
                      }}
                      className="text-[#38BDF8] hover:underline ml-2"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-[#050B14] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-[#38BDF8] outline-none"
                  >
                    <option value="score_desc">Highest Anomaly Score</option>
                    <option value="score_asc">Lowest Anomaly Score</option>
                    <option value="date_desc">Newest First</option>
                    <option value="date_asc">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk Actions Toolbar */}
            {selectedCaseIds.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0E2036] border border-[#38BDF8]/40 text-xs shadow-lg animate-fadeIn flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white bg-[#38BDF8]/20 px-2.5 py-1 rounded border border-[#38BDF8]/40">
                    {selectedCaseIds.length} case{selectedCaseIds.length > 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={() => setSelectedCaseIds([])}
                    className="text-slate-400 hover:text-white"
                  >
                    Deselect all
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Bulk Status */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as any)}
                      className="bg-[#050B14] border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:border-[#38BDF8] outline-none"
                    >
                      <option value="">Change Status...</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Awaiting Verification">Awaiting Verification</option>
                      <option value="Resolved">Resolved</option>
                      <option value="False Alarm">False Alarm</option>
                    </select>
                    <button
                      onClick={handleBulkStatusApply}
                      disabled={!bulkStatus}
                      className="px-2.5 py-1 rounded bg-[#38BDF8] text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#38BDF8]/90"
                    >
                      Apply Status
                    </button>
                  </div>

                  {/* Bulk Assign */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={bulkAssignee}
                      onChange={(e) => setBulkAssignee(e.target.value)}
                      className="bg-[#050B14] border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:border-[#38BDF8] outline-none"
                    >
                      <option value="">Assign To...</option>
                      {AVAILABLE_ASSIGNEES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleBulkAssignApply}
                      disabled={!bulkAssignee}
                      className="px-2.5 py-1 rounded bg-[#B8FF65] text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#B8FF65]/90"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Cases Table */}
            <div className="rounded-xl border border-slate-800 bg-[#0B1524] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 bg-[#050B14]/80">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <button
                          onClick={handleSelectAll}
                          className="text-slate-400 hover:text-white"
                          title={selectedCaseIds.length === filteredCases.length ? 'Deselect all' : 'Select all'}
                        >
                          {selectedCaseIds.length > 0 && selectedCaseIds.length === filteredCases.length ? (
                            <CheckSquare className="w-4 h-4 text-[#38BDF8]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="p-3">Case ID</th>
                      <th className="p-3">Meter ID</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Anomaly Score</th>
                      <th className="p-3">Classification</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Assignee</th>
                      <th className="p-3">Resolution Progress</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredCases.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400">
                          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-60" />
                          No anomaly cases match your active filters.
                        </td>
                      </tr>
                    ) : (
                      filteredCases.map((c) => {
                        const isSelected = selectedCaseIds.includes(c.caseId);
                        const completedRecs = c.recommendations.filter((r) => r.completed).length;
                        const totalRecs = c.recommendations.length;
                        const recProgressPct = totalRecs > 0 ? (completedRecs / totalRecs) * 100 : 0;

                        return (
                          <tr
                            key={c.caseId}
                            className={`hover:bg-[#0E2036]/60 transition-colors ${
                              isSelected ? 'bg-[#38BDF8]/5' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleToggleCase(c.caseId)}
                                className="text-slate-400 hover:text-white"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#38BDF8]" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-600" />
                                )}
                              </button>
                            </td>

                            {/* Case ID */}
                            <td className="p-3">
                              <button
                                onClick={() => setActiveCaseId(c.caseId)}
                                className="font-mono font-bold text-[#38BDF8] hover:underline text-left"
                              >
                                {c.caseId}
                              </button>
                              <div className="text-[10px] text-slate-500">
                                {new Date(c.createdAt).toLocaleDateString()}
                              </div>
                            </td>

                            {/* Meter ID */}
                            <td className="p-3 font-mono text-xs text-slate-300">
                              {c.meterId}
                            </td>

                            {/* State / District */}
                            <td className="p-3">
                              <div className="font-medium text-slate-200">{c.state}</div>
                              <div className="text-[11px] text-slate-400">
                                {c.district} <span className="text-slate-600">({c.region})</span>
                              </div>
                            </td>

                            {/* Anomaly Score */}
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-sm font-bold ${
                                  c.score >= 0.7 ? 'text-red-400' : c.score >= 0.4 ? 'text-amber-300' : 'text-emerald-400'
                                }`}>
                                  {(c.score * 100).toFixed(1)}%
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  c.score >= 0.7
                                    ? 'bg-red-500/15 border-red-500/40 text-red-300'
                                    : c.score >= 0.4
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                }`}>
                                  {c.score >= 0.7 ? 'HIGH' : c.score >= 0.4 ? 'MED' : 'LOW'}
                                </span>
                              </div>
                            </td>

                            {/* Classification */}
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#14263D] text-[#38BDF8] border border-[#38BDF8]/25 whitespace-nowrap">
                                <Sparkles className="w-3 h-3 text-[#38BDF8]" />
                                {c.anomalyType}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
                                c.status === 'Resolved'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : c.status === 'False Alarm'
                                  ? 'bg-slate-500/15 text-slate-300 border-slate-500/40'
                                  : c.status === 'Under Review'
                                  ? 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40'
                                  : c.status === 'Investigation Created'
                                  ? 'bg-violet-500/15 text-violet-300 border-violet-500/40'
                                  : c.status === 'Awaiting Verification'
                                  ? 'bg-orange-500/15 text-orange-300 border-orange-500/40'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              }`}>
                                {c.status === 'Resolved' ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : c.status === 'Under Review' ? (
                                  <Clock className="w-3 h-3" />
                                ) : (
                                  <CircleDot className="w-3 h-3" />
                                )}
                                {c.status}
                              </span>
                            </td>

                            {/* Assignee */}
                            <td className="p-3 text-xs text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                                <span className={c.assignee === 'Unassigned' ? 'text-slate-500 italic' : 'text-slate-200'}>
                                  {c.assignee?.split(' ')[0] ?? 'Unassigned'}
                                </span>
                              </div>
                            </td>

                            {/* Resolution Progress */}
                            <td className="p-3">
                              <div className="w-28 space-y-1">
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>{completedRecs}/{totalRecs} done</span>
                                  <span>{recProgressPct.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-[#14263D] overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 rounded-full ${
                                      recProgressPct === 100
                                        ? 'bg-emerald-400'
                                        : recProgressPct > 0
                                        ? 'bg-[#38BDF8]'
                                        : 'bg-slate-600'
                                    }`}
                                    style={{ width: `${recProgressPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Action */}
                            <td className="p-3 text-right">
                              <button
                                onClick={() => setActiveCaseId(c.caseId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-[#38BDF8] border border-[#38BDF8]/40 bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 transition-colors whitespace-nowrap"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                Open Case
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Case Details Drawer */}
      <AnomalyResolutionDrawer
        caseId={activeCaseId}
        onClose={() => setActiveCaseId(null)}
      />
    </div>
  );
};
