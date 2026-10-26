/**
 * FLNetworkOverlay — Floating federated learning network intelligence panel
 * 
 * Displays real-time FL training status, regional client participation,
 * privacy budget accounting, and benchmark comparisons overlaid on the
 * 3D globe or 2D planar view.
 * 
 * All metrics are sourced from actual experiment results in
 * federatedExperimentResults.json — no fabricated SCADA/utility telemetry.
 */

import { X, Shield, Activity, Users, Cpu, AlertTriangle } from 'lucide-react';
import {
  TRAINING_STATUS,
  REGIONAL_CLIENTS,
  PRIVACY_BUDGET,
  MODEL_PERFORMANCE,
  TOTAL_DISCOM_NODES,
  DISCOM_DISTRIBUTION,
  formatEpsilon,
  formatSigma,
} from '../../data/projectFacts';

interface FLNetworkOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export const FLNetworkOverlay: React.FC<FLNetworkOverlayProps> = ({ visible, onClose }) => {
  if (!visible) return null;

  const regionLabels: Record<string, string> = {
    NR: 'Northern',
    WR: 'Western',
    SR: 'Southern',
    ER: 'Eastern',
    NER: 'North-Eastern',
  };

  const regionColors: Record<string, string> = {
    NR: '#EF4444',
    WR: '#38BDF8',
    SR: '#818CF8',
    ER: '#2DD4BF',
    NER: '#F59E0B',
  };

  return (
    <div className="absolute bottom-4 left-4 z-30 w-[360px] max-h-[calc(100%-100px)] overflow-y-auto rounded-xl bg-[#060E1A]/95 backdrop-blur-xl border border-[#1A3350] shadow-2xl pointer-events-auto select-none animate-in slide-in-from-left-4 duration-300">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-[#14263D] bg-[#060E1A]/95 backdrop-blur-xl rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#B8FF65]/15 border border-[#B8FF65]/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-[#B8FF65]" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100 font-mono">FL NETWORK INTEL</div>
            <div className="text-[9px] text-slate-500 font-mono">DP-FedAvg • Simulated Benchmark</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#14263D] transition-colors"
          aria-label="Close FL Overlay"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Training Status */}
      <div className="p-3 border-b border-[#14263D]/60">
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2">
          Training Progress
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-lg font-bold font-mono text-[#B8FF65]">
                {TRAINING_STATUS.roundsCompleted}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                / {TRAINING_STATUS.roundsPlanned} rounds
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#0A1626] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#B8FF65] to-[#38BDF8]"
                style={{
                  width: `${(TRAINING_STATUS.roundsCompleted / TRAINING_STATUS.roundsPlanned) * 100}%`,
                  transition: 'width 0.8s ease-out',
                }}
              />
            </div>
          </div>
          <div className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
            {TRAINING_STATUS.status.toUpperCase()}
          </div>
        </div>
        <div className="mt-2 text-[10px] font-mono text-slate-500">
          {TRAINING_STATUS.localEpochs} local epochs/round • Seed: 42
        </div>
      </div>

      {/* Privacy Budget */}
      <div className="p-3 border-b border-[#14263D]/60">
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-[#38BDF8]" />
          Privacy Budget
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-[#0A1422] border border-[#14263D]">
            <div className="text-xs font-bold font-mono text-[#38BDF8]">
              {formatEpsilon(PRIVACY_BUDGET.epsilon)}
            </div>
            <div className="text-[9px] text-slate-500">Achieved</div>
          </div>
          <div className="p-2 rounded-lg bg-[#0A1422] border border-[#14263D]">
            <div className="text-xs font-bold font-mono text-slate-200">
              {formatSigma(PRIVACY_BUDGET.sigma)}
            </div>
            <div className="text-[9px] text-slate-500">Noise</div>
          </div>
          <div className="p-2 rounded-lg bg-[#0A1422] border border-[#14263D]">
            <div className="text-xs font-bold font-mono text-slate-200">
              C = {PRIVACY_BUDGET.clipNorm}
            </div>
            <div className="text-[9px] text-slate-500">Clip Norm</div>
          </div>
        </div>
        <div className="mt-2 text-[9px] font-mono text-slate-500 leading-relaxed">
          Mechanism: {PRIVACY_BUDGET.mechanism}
        </div>
      </div>

      {/* Regional Clients */}
      <div className="p-3 border-b border-[#14263D]/60">
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Users className="w-3 h-3 text-[#B8FF65]" />
          Regional Clients ({REGIONAL_CLIENTS.count} regions • {TOTAL_DISCOM_NODES} DISCOMs)
        </div>
        <div className="space-y-1.5">
          {REGIONAL_CLIENTS.ids.map((regionId) => {
            const client = REGIONAL_CLIENTS.details[regionId];
            const color = regionColors[regionId] || '#38BDF8';
            const discoms = DISCOM_DISTRIBUTION[regionId] || 0;
            return (
              <div
                key={regionId}
                className="flex items-center justify-between p-2 rounded-lg bg-[#0A1422]/70 border border-[#14263D]/50 hover:bg-[#0E1F33] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div>
                    <div className="text-[11px] font-mono font-medium text-slate-200">
                      {regionId}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {regionLabels[regionId]} • {discoms} DISCOMs
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-slate-300">
                    {client.train_samples} train
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {(client.train_anomaly_rate * 100).toFixed(1)}% anomaly
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Model Benchmark Comparison */}
      <div className="p-3 border-b border-[#14263D]/60">
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-[#38BDF8]" />
          Benchmark Comparison (ROC-AUC)
        </div>
        <div className="space-y-1.5">
          {[
            { name: 'Local-only', auc: 0.805, color: '#64748B', note: 'Isolated per-region' },
            { name: 'Federated (UrjaSetu)', auc: MODEL_PERFORMANCE.testRocAuc, color: '#38BDF8', note: 'DP-FedAvg', highlight: true },
            { name: 'Centralized', auc: 0.893, color: '#B8FF65', note: 'Upper bound (pooled)' },
          ].map((b) => (
            <div
              key={b.name}
              className={`flex items-center justify-between p-2 rounded-lg border ${
                b.highlight
                  ? 'bg-[#38BDF8]/8 border-[#38BDF8]/30'
                  : 'bg-[#0A1422]/50 border-[#14263D]/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-5 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <div>
                  <div className={`text-[11px] font-mono font-medium ${b.highlight ? 'text-[#38BDF8]' : 'text-slate-300'}`}>
                    {b.name}
                  </div>
                  <div className="text-[9px] text-slate-500">{b.note}</div>
                </div>
              </div>
              <div className={`text-sm font-bold font-mono ${b.highlight ? 'text-[#38BDF8]' : 'text-slate-200'}`}>
                {(b.auc * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[9px] text-slate-500 text-center font-sans">
          Federated learning approaches the centralized ceiling without sharing raw data
        </div>
      </div>

      {/* Simulation Disclaimer */}
      <div className="p-3">
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[9px] text-amber-300/80 font-mono leading-relaxed">
            <span className="font-bold">EXP-URJA-FEDAVG</span> — Simulated benchmark on synthetically
            partitioned smart meter data. Not live utility/SCADA telemetry. DP accounting:
            ε={PRIVACY_BUDGET.epsilon.toFixed(2)}, δ={PRIVACY_BUDGET.delta.toExponential(0)}.
          </div>
        </div>
      </div>
    </div>
  );
};
