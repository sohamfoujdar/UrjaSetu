/**
 * caseStore.ts
 * 
 * Shared in-memory state store for Anomaly Resolution Center cases.
 * Cases created from Anomaly Intelligence appear in Investigations & Reports.
 * 
 * This is a simple singleton store (no backend, no localStorage) —
 * data persists within the browser session only.
 * 
 * All data is synthetic/simulated. Anomaly scores are investigative
 * signals, not proof of any wrongdoing.
 */

import streamReplayData from '../data/streamReplay.json';
import { STATE_TO_REGION_MAP } from '../constants/gridData';

export type CaseStatus =
  | 'Detected'
  | 'Under Review'
  | 'Investigation Created'
  | 'Awaiting Verification'
  | 'Resolved'
  | 'False Alarm'
  | 'Inconclusive';

export type ResolutionOutcome =
  | 'Meter fault confirmed'
  | 'Communication error'
  | 'Normal seasonal variation'
  | 'Field inspection requested'
  | 'False positive — no action'
  | 'Inconclusive — further monitoring'
  | 'Other';

export type RecommendationId =
  | 'verify-readings'
  | 'check-comms'
  | 'compare-historical'
  | 'request-inspection'
  | 'cross-check-billing'
  | 'flag-for-audit';

export interface CaseRecommendation {
  id: RecommendationId;
  label: string;
  description: string;
  completed: boolean;
}

export interface CaseNote {
  id: string;
  author: string;
  timestamp: string;
  text: string;
}

export interface CaseTimelineEvent {
  id: string;
  timestamp: string;
  type: 'status-change' | 'note' | 'action' | 'investigation' | 'resolution';
  label: string;
  detail?: string;
  actor?: string;
}

export interface AnomalyCase {
  caseId: string;
  /** Stream record id from streamReplay.json */
  recordId: number;
  region: string;
  regionName: string;
  /** DP-FedAvg model score 0-1 */
  score: number;
  /** Ground truth label (0=normal, 1=anomaly) from dataset */
  groundTruthLabel: number;
  /** Synthetic meter ID derived deterministically from record id */
  meterId: string;
  /** Synthetic district derived deterministically */
  district: string;
  /** Synthetic state derived deterministically */
  state: string;
  hourlyLoad: number[];
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  recommendations: CaseRecommendation[];
  notes: CaseNote[];
  timeline: CaseTimelineEvent[];
  resolutionOutcome?: ResolutionOutcome;
  resolutionNote?: string;
  investigationRef?: string;
  assignee?: string;
  tags: string[];
  anomalyType: string;
  isSimulated: true;
}

export const AVAILABLE_ASSIGNEES = [
  'Unassigned',
  'Priya Sharma (Sr. Grid Analyst)',
  'Rahul Verma (Field Ops Lead)',
  'Ananya Iyer (DISCOM Audit)',
  'Vikram Patel (Smart Meter Comms)',
  'Sunil Rao (Substation Engineer)',
];

export const AVAILABLE_TAGS = [
  'High Priority',
  'Suspected Bypass',
  'Comms Drop',
  'Industrial Feeder',
  'Commercial Feeder',
  'Residential Cluster',
  'Audit Required',
  'Field Inspection',
];

export function inferAnomalyType(hourlyLoad: number[] = [], score: number): string {
  if (!hourlyLoad || hourlyLoad.length === 0) {
    return score >= 0.7 ? 'Severe Load Deviation' : 'Unusual Consumption Spike';
  }
  const max = Math.max(...hourlyLoad);
  const nightAvg = hourlyLoad.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  const dayAvg = hourlyLoad.slice(6, 22).reduce((a, b) => a + b, 0) / 16;

  if (max < 0.25) return 'Zero Consumption Drop';
  if (nightAvg > dayAvg * 1.35) return 'Off-Peak Night Surge';
  if (score >= 0.85) return 'Suspected Meter Bypass';
  if (max > 0.9) return 'Peak Load Spike';
  if (score >= 0.6) return 'High Consumption Spike';
  return 'Unusual Consumption Pattern';
}


// ─────────────────────────────────────────────
// Deterministic synthetic helpers
// ─────────────────────────────────────────────

const REGION_STATES: Record<string, string[]> = {
  NR: ['Uttar Pradesh', 'Rajasthan', 'Punjab', 'Haryana', 'Delhi'],
  WR: ['Maharashtra', 'Gujarat', 'Madhya Pradesh', 'Chhattisgarh'],
  SR: ['Karnataka', 'Tamil Nadu', 'Telangana', 'Andhra Pradesh', 'Kerala'],
  ER: ['West Bengal', 'Bihar', 'Jharkhand', 'Odisha'],
  NER: ['Assam', 'Manipur', 'Meghalaya', 'Tripura'],
};

const REGION_NAMES: Record<string, string> = {
  NR: 'Northern',
  WR: 'Western',
  SR: 'Southern',
  ER: 'Eastern',
  NER: 'North-Eastern',
};

const REGION_DISTRICTS: Record<string, string[]> = {
  NR: ['Lucknow', 'Agra', 'Jaipur', 'Ludhiana', 'Gurugram', 'Noida'],
  WR: ['Mumbai', 'Pune', 'Ahmedabad', 'Surat', 'Indore', 'Bhopal'],
  SR: ['Bengaluru', 'Chennai', 'Hyderabad', 'Coimbatore', 'Mysuru', 'Vijayawada'],
  ER: ['Kolkata', 'Patna', 'Dhanbad', 'Bhubaneswar', 'Ranchi'],
  NER: ['Guwahati', 'Silchar', 'Imphal', 'Shillong'],
};

export function deterministicPick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function buildMeterId(recordId: number, region: string): string {
  return `MTR-${region}-${String(recordId).padStart(4, '0')}`;
}

export function buildCaseId(recordId: number): string {
  return `CASE-ARC-${String(recordId).padStart(5, '0')}`;
}

export function getSyntheticState(region: string, recordId: number): string {
  const states = REGION_STATES[region] ?? ['Unknown'];
  return deterministicPick(states, recordId);
}

export function getSyntheticDistrict(region: string, recordId: number): string {
  const districts = REGION_DISTRICTS[region] ?? ['Unknown'];
  return deterministicPick(districts, recordId + 3); // offset to vary
}

export function getRegionName(region: string): string {
  return REGION_NAMES[region] ?? region;
}

// ─────────────────────────────────────────────
// Default recommendations by anomaly severity
// ─────────────────────────────────────────────

function buildRecommendations(score: number): CaseRecommendation[] {
  const high = score >= 0.7;
  const medium = score >= 0.4;

  const recs: CaseRecommendation[] = [
    {
      id: 'verify-readings',
      label: 'Verify Meter Readings',
      description: 'Cross-check the flagged readings against the raw meter log and adjacent billing periods.',
      completed: false,
    },
    {
      id: 'check-comms',
      label: 'Check Communication Status',
      description: 'Verify that the meter\'s RF/PLC communication link is active and data is not being lost in transit.',
      completed: false,
    },
    {
      id: 'compare-historical',
      label: 'Compare Against Historical Baseline',
      description: 'Review the same meter\'s load profile over the past 30–90 days to distinguish seasonal variation from anomalous behaviour.',
      completed: false,
    },
  ];

  if (medium) {
    recs.push({
      id: 'cross-check-billing',
      label: 'Cross-Check Billing Records',
      description: 'Compare flagged consumption with DISCOM billing data to identify discrepancies that may warrant a field visit.',
      completed: false,
    });
  }

  if (high) {
    recs.push({
      id: 'request-inspection',
      label: 'Request Technical Field Inspection',
      description: 'Escalate to the field operations team for an on-site inspection of the meter hardware and seals.',
      completed: false,
    });
    recs.push({
      id: 'flag-for-audit',
      label: 'Flag for Revenue Audit',
      description: 'Mark this case for inclusion in the DISCOM\'s periodic revenue protection audit cycle.',
      completed: false,
    });
  }

  return recs;
}

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

class CaseStore {
  private cases: Map<string, AnomalyCase> = new Map();
  private listeners: Array<() => void> = [];

  constructor() {
    this.seedInitialCases();
  }

  /**
   * Seed initial cases from the held-out stream replay dataset
   * so the Anomaly Resolution Center has realistic cases on load.
   */
  private seedInitialCases(): void {
    try {
      const raw: any = streamReplayData;
      const records = (Array.isArray(raw)
        ? raw
        : raw?.stream ?? raw?.records ?? raw?.samples ?? []) as Array<{
          id: number;
          region: string;
          label: number;
          score: number;
          hourly_load: number[];
        }>;

      if (!records || records.length === 0) return;

      // Take top 25 highest anomaly scores
      const topRecords = [...records].sort((a, b) => b.score - a.score).slice(0, 25);

      const sampleStatuses: CaseStatus[] = [
        'Detected',
        'Under Review',
        'Investigation Created',
        'Awaiting Verification',
        'Under Review',
        'Detected',
        'Resolved',
        'False Alarm',
      ];

      const sampleAssignees = [
        'Priya Sharma (Sr. Grid Analyst)',
        'Rahul Verma (Field Ops Lead)',
        'Ananya Iyer (DISCOM Audit)',
        'Vikram Patel (Smart Meter Comms)',
        'Unassigned',
      ];

      topRecords.forEach((rec, idx) => {
        const c = this.openCase(rec);
        // Vary statuses and assignees for initial triage queue
        const assignedStatus = sampleStatuses[idx % sampleStatuses.length];
        const assignedPerson = sampleAssignees[idx % sampleAssignees.length];

        c.status = assignedStatus;
        c.assignee = assignedPerson;

        // If high score, tag it
        if (rec.score >= 0.85) {
          c.tags = ['High Priority', 'Suspected Bypass'];
        } else if (rec.score >= 0.65) {
          c.tags = ['Audit Required'];
        } else {
          c.tags = ['Field Inspection'];
        }

        // Add some realistic notes on a few cases
        if (idx === 1) {
          c.notes.push({
            id: `seed-note-1`,
            author: 'Priya Sharma (Sr. Grid Analyst)',
            timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
            text: 'Telemetry shows sudden 82% drop in daytime load while neighbor meters remain constant. Cross-referencing billing history.',
          });
        } else if (idx === 3) {
          c.notes.push({
            id: `seed-note-2`,
            author: 'Rahul Verma (Field Ops Lead)',
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
            text: 'Inspection dispatch ticket #DISP-9842 logged with local circle office.',
          });
        }
      });
    } catch (e) {
      console.warn('Failed to seed initial cases:', e);
    }
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  getCases(): AnomalyCase[] {
    return Array.from(this.cases.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getCase(caseId: string): AnomalyCase | undefined {
    return this.cases.get(caseId);
  }

  hasCase(recordId: number): boolean {
    return this.cases.has(buildCaseId(recordId));
  }

  /**
   * Retrieve all anomaly cases for a given state & district.
   * If cases don't yet exist in the store, deterministically generates
   * realistic simulated cases based on the district's stream telemetry.
   */
  getDistrictCases(
    state: string,
    district: string,
    districtStats?: { n?: number; flagged?: number; avgScore?: number; trueAnomalies?: number }
  ): AnomalyCase[] {
    const sLower = state.toLowerCase().trim();
    const dLower = district.toLowerCase().trim();

    // 1. Check existing stored cases
    const existing = this.getCases().filter(
      (c) => c.state.toLowerCase().trim() === sLower && c.district.toLowerCase().trim() === dLower
    );

    if (existing.length >= 2) {
      return existing;
    }

    // 2. Deterministically seed cases for this district based on telemetry
    const countToEnsure = Math.max(existing.length, Math.min(Math.max(districtStats?.flagged ?? 3, 2), 5));
    const baseScore = districtStats?.avgScore ?? 0.68;
    const region = STATE_TO_REGION_MAP[state] ?? 'WR';

    let hash = 0;
    const str = `${state}_${district}`;
    for (let j = 0; j < str.length; j++) {
      hash = ((hash << 5) - hash + str.charCodeAt(j)) | 0;
    }
    const seed = Math.abs(hash);

    const needed = countToEnsure - existing.length;
    for (let i = 0; i < needed; i++) {
      const idx = existing.length + i;
      const recordId = 30000 + (seed % 40000) + idx * 101;
      const caseId = buildCaseId(recordId);

      if (this.cases.has(caseId)) continue;

      // Deterministic score variation
      const scoreVariance = ((((seed + idx * 17) % 20) - 10) / 100);
      const score = Math.max(0.35, Math.min(0.96, baseScore + scoreVariance));
      const groundTruthLabel = score >= 0.6 ? 1 : 0;

      // Deterministic 24-hour load profile
      const hourlyLoad: number[] = [];
      const isNightSurge = (seed + idx) % 3 === 0;
      const isDaySpike = (seed + idx) % 3 === 1;

      for (let h = 0; h < 24; h++) {
        let val = 0.3 + 0.15 * Math.sin((h / 24) * Math.PI * 2 - Math.PI / 2);
        if (h >= 9 && h <= 12) val += 0.25;
        if (h >= 19 && h <= 22) val += 0.35;

        if (isNightSurge && h >= 1 && h <= 5) {
          val += 0.45;
        } else if (isDaySpike && h >= 13 && h <= 17) {
          val += 0.4;
        } else if (!isNightSurge && !isDaySpike && h >= 10 && h <= 18) {
          val = Math.max(0.08, val * 0.3);
        }
        val += (((seed + h * 7) % 10) - 5) / 100;
        hourlyLoad.push(Math.max(0.05, Math.min(1.0, val)));
      }

      const now = new Date(Date.now() - ((seed + idx * 86400) % (7 * 86400000))).toISOString();
      const sampleStatuses: CaseStatus[] = [
        'Detected',
        'Under Review',
        'Investigation Created',
        'Awaiting Verification',
        'Under Review',
      ];
      const assignedStatus = sampleStatuses[(seed + idx) % sampleStatuses.length];
      const assignedPerson = AVAILABLE_ASSIGNEES[(seed + idx) % (AVAILABLE_ASSIGNEES.length - 1) + 1];

      const newCase: AnomalyCase = {
        caseId,
        recordId,
        region,
        regionName: getRegionName(region),
        score,
        groundTruthLabel,
        meterId: buildMeterId(recordId, region),
        district,
        state,
        hourlyLoad,
        status: assignedStatus,
        createdAt: now,
        updatedAt: now,
        recommendations: buildRecommendations(score),
        notes: [
          {
            id: `note-${Date.now()}-${idx}`,
            author: 'System',
            timestamp: now,
            text: `Telemetry flagged in ${district} circle with ${(score * 100).toFixed(1)}% model divergence. Telemetry baseline logged.`,
          },
        ],
        timeline: [
          {
            id: `tl-${Date.now()}-${idx}`,
            timestamp: now,
            type: 'status-change',
            label: 'Case opened',
            detail: `Telemetry flagged by DP-FedAvg model stream for ${district}, ${state}.`,
            actor: 'System',
          },
        ],
        assignee: assignedPerson,
        tags: score >= 0.7 ? ['High Priority', 'Audit Required'] : ['Field Inspection'],
        anomalyType: inferAnomalyType(hourlyLoad, score),
        isSimulated: true,
      };

      this.cases.set(caseId, newCase);
    }

    this.notify();
    return this.getCases().filter(
      (c) => c.state.toLowerCase().trim() === sLower && c.district.toLowerCase().trim() === dLower
    );
  }

  /** Create a new case from a stream record — idempotent. */
  openCase(record: {
    id: number;
    region: string;
    score: number;
    label: number;
    hourly_load: number[];
  }): AnomalyCase {
    const caseId = buildCaseId(record.id);
    if (this.cases.has(caseId)) {
      return this.cases.get(caseId)!;
    }

    const now = new Date().toISOString();
    const newCase: AnomalyCase = {
      caseId,
      recordId: record.id,
      region: record.region,
      regionName: getRegionName(record.region),
      score: record.score,
      groundTruthLabel: record.label,
      meterId: buildMeterId(record.id, record.region),
      district: getSyntheticDistrict(record.region, record.id),
      state: getSyntheticState(record.region, record.id),
      hourlyLoad: record.hourly_load || [],
      status: 'Detected',
      createdAt: now,
      updatedAt: now,
      recommendations: buildRecommendations(record.score),
      notes: [],
      timeline: [
        {
          id: `tl-${Date.now()}`,
          timestamp: now,
          type: 'status-change',
          label: 'Case opened',
          detail: 'Anomaly detected by DP-FedAvg model. Case created for review.',
          actor: 'System',
        },
      ],
      assignee: 'Unassigned',
      tags: record.score >= 0.7 ? ['High Priority', 'Audit Required'] : ['Review Needed'],
      anomalyType: inferAnomalyType(record.hourly_load, record.score),
      isSimulated: true,
    };

    this.cases.set(caseId, newCase);
    this.notify();
    return newCase;
  }

  updateStatus(caseId: string, status: CaseStatus, actor = 'Analyst'): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    c.status = status;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'status-change',
      label: `Status changed to "${status}"`,
      actor,
    });
    this.notify();
  }

  assignCase(caseId: string, assignee: string, actor = 'Analyst'): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    const oldAssignee = c.assignee ?? 'Unassigned';
    c.assignee = assignee;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'action',
      label: `Assigned to ${assignee}`,
      detail: `Reassigned from ${oldAssignee}`,
      actor,
    });
    this.notify();
  }

  updateTags(caseId: string, tags: string[], actor = 'Analyst'): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    c.tags = tags;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'action',
      label: `Tags updated (${tags.length} active)`,
      detail: tags.join(', ') || 'No tags',
      actor,
    });
    this.notify();
  }

  addTag(caseId: string, tag: string): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    if (!c.tags.includes(tag)) {
      c.tags = [...c.tags, tag];
      c.updatedAt = new Date().toISOString();
      this.notify();
    }
  }

  removeTag(caseId: string, tag: string): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    c.tags = c.tags.filter((t) => t !== tag);
    c.updatedAt = new Date().toISOString();
    this.notify();
  }

  addNote(caseId: string, text: string, author = 'Analyst'): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    const note: CaseNote = {
      id: `note-${Date.now()}`,
      author,
      timestamp: now,
      text,
    };
    c.notes.push(note);
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'note',
      label: 'Note added',
      detail: text.length > 80 ? text.slice(0, 80) + '…' : text,
      actor: author,
    });
    this.notify();
  }

  toggleRecommendation(caseId: string, recId: RecommendationId): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const rec = c.recommendations.find((r) => r.id === recId);
    if (!rec) return;
    const now = new Date().toISOString();
    rec.completed = !rec.completed;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'action',
      label: rec.completed
        ? `Recommendation completed: "${rec.label}"`
        : `Recommendation unmarked: "${rec.label}"`,
      actor: 'Analyst',
    });
    this.notify();
  }

  createInvestigation(caseId: string): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    const invRef = `INV-${caseId}-${Date.now().toString(36).toUpperCase()}`;
    c.investigationRef = invRef;
    c.status = 'Investigation Created';
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'investigation',
      label: `Investigation created`,
      detail: `Reference: ${invRef}`,
      actor: 'Analyst',
    });
    this.notify();
  }

  resolveCase(caseId: string, outcome: ResolutionOutcome, note: string): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    c.status = 'Resolved';
    c.resolutionOutcome = outcome;
    c.resolutionNote = note;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'resolution',
      label: `Case resolved — ${outcome}`,
      detail: note || undefined,
      actor: 'Analyst',
    });
    this.notify();
  }

  markFalseAlarm(caseId: string, note: string): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    c.status = 'False Alarm';
    c.resolutionOutcome = 'False positive — no action';
    c.resolutionNote = note;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'resolution',
      label: 'Marked as False Alarm',
      detail: note || undefined,
      actor: 'Analyst',
    });
    this.notify();
  }

  reopenCase(caseId: string): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const now = new Date().toISOString();
    c.status = 'Under Review';
    c.resolutionOutcome = undefined;
    c.resolutionNote = undefined;
    c.updatedAt = now;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: now,
      type: 'status-change',
      label: 'Case reopened',
      actor: 'Analyst',
    });
    this.notify();
  }

  // ─────────────────────────────────────────────
  // Bulk Actions
  // ─────────────────────────────────────────────

  bulkUpdateStatus(caseIds: string[], status: CaseStatus, actor = 'Analyst'): void {
    caseIds.forEach((id) => this.updateStatus(id, status, actor));
  }

  bulkAssign(caseIds: string[], assignee: string, actor = 'Analyst'): void {
    caseIds.forEach((id) => this.assignCase(id, assignee, actor));
  }

  // ─────────────────────────────────────────────
  // Export Helpers
  // ─────────────────────────────────────────────

  exportToJson(casesToExport?: AnomalyCase[]): string {
    const list = casesToExport ?? this.getCases();
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        system: 'UrjaSetu Anomaly Resolution Center',
        environment: 'Simulated Grid Stream (DP-FedAvg model)',
        totalCases: list.length,
        cases: list.map((c) => ({
          caseId: c.caseId,
          meterId: c.meterId,
          region: c.region,
          state: c.state,
          district: c.district,
          anomalyScore: Number(c.score.toFixed(4)),
          anomalyType: c.anomalyType,
          status: c.status,
          assignee: c.assignee ?? 'Unassigned',
          tags: c.tags,
          groundTruthLabel: c.groundTruthLabel,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          resolutionOutcome: c.resolutionOutcome ?? null,
          resolutionNote: c.resolutionNote ?? null,
          investigationRef: c.investigationRef ?? null,
          completedRecommendations: c.recommendations.filter((r) => r.completed).map((r) => r.label),
          notesCount: c.notes.length,
        })),
      },
      null,
      2
    );
  }

  exportToCsv(casesToExport?: AnomalyCase[]): string {
    const list = casesToExport ?? this.getCases();
    const headers = [
      'Case ID',
      'Meter ID',
      'Region',
      'State',
      'District',
      'Anomaly Score (%)',
      'Anomaly Type',
      'Status',
      'Assignee',
      'Tags',
      'Dataset Label',
      'Created At',
      'Updated At',
      'Resolution Outcome',
      'Resolution Notes',
      'Investigation Ref',
    ];

    const rows = list.map((c) => [
      c.caseId,
      c.meterId,
      c.region,
      `"${c.state}"`,
      `"${c.district}"`,
      (c.score * 100).toFixed(1),
      `"${c.anomalyType}"`,
      c.status,
      `"${c.assignee ?? 'Unassigned'}"`,
      `"${c.tags.join('; ')}"`,
      c.groundTruthLabel === 1 ? 'Anomaly' : 'Normal',
      c.createdAt,
      c.updatedAt,
      `"${c.resolutionOutcome ?? ''}"`,
      `"${(c.resolutionNote ?? '').replace(/"/g, '""')}"`,
      c.investigationRef ?? '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

/** Singleton case store shared across the entire application */
export const caseStore = new CaseStore();

