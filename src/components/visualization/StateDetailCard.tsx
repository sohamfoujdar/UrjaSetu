import { X, ShieldAlert, TrendingUp, Users, Activity, Database, Map as MapIcon } from 'lucide-react';
import type { GridRegionCode } from '../../types/grid';
import { GRID_REGIONS_CONFIG } from '../../constants/gridData';
import { StatusIndicator } from '../common/StatusIndicator';
import { formatNumber } from '../../utils/formatIndian';
import { TRAINING_STATUS, formatEpsilon } from '../../data/projectFacts';
import experimentDataRaw from '../../data/federatedExperimentResults.json';
import type { FederatedExperimentPayload } from '../../types/fl';
import { isStateSupported } from '../../constants/supportedStates';

const experimentData = experimentDataRaw as unknown as FederatedExperimentPayload;

export interface SelectedStateData {
  name: string;
  region: GridRegionCode;
  status: 'optimal' | 'warning' | 'alert' | 'syncing';
}

interface StateDetailCardProps {
  state: SelectedStateData | null;
  onClose: () => void;
  onNavigateToAnalysis?: (stateName: string) => void;
  onZoomToStateView?: (stateName: string) => void;
  isStateView?: boolean;
}

export const StateDetailCard = ({
  state,
  onClose,
  onNavigateToAnalysis,
  onZoomToStateView,
  isStateView = false,
}: StateDetailCardProps) => {
  if (!state) return null;

  const regionConfig = GRID_REGIONS_CONFIG[state.region] || {
    name: 'National Grid',
    label: state.region,
    color: '#38BDF8',
    center: [82.5, 22.0] as const,
  };

  // Get real regional data from experiment results
  const getRegionalData = (region: GridRegionCode) => {
    const clientData = experimentData.regional_clients[region];
    const localOnlyData = experimentData.benchmarks.local_only.per_client_breakdown[region];
    
    if (!clientData || !localOnlyData) {
      return null;
    }
    
    return {
      trainSamples: clientData.train_samples,
      testSamples: clientData.test_samples_contributed,
      anomalyRate: clientData.train_anomaly_rate,
      localOnlyROCauc: localOnlyData.test_roc_auc,
      localOnlyF1: localOnlyData.test_f1,
    };
  };

  const regionalData = getRegionalData(state.region);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between p-4 pb-3 border-b border-[#14263D]">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span 
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
              style={{
                backgroundColor: `${regionConfig.color}15`,
                color: regionConfig.color,
                borderColor: `${regionConfig.color}40`,
              }}
            >
              {state.region}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {regionConfig.name}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white font-display leading-tight">
            {state.name}
          </h2>
          <div className="mt-2">
            <StatusIndicator 
              status={state.status} 
              label={state.status === 'optimal' ? 'Operational' : 
                     state.status === 'syncing' ? 'Synchronizing' : 
                     state.status === 'warning' ? 'Warning' : 'Alert'} 
              size="sm" 
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#0E2036] transition-colors"
          title="Close state inspector"
          aria-label="Close state inspector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Grid Metrics */}
        <section>
          <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
            Regional Client Data
          </h3>

          {regionalData ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A]">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">Train Samples</div>
                <div className="text-lg font-bold font-mono text-white">
                  {formatNumber(regionalData.trainSamples)}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">Local training data</div>
              </div>

              <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A]">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">Test Samples</div>
                <div className="text-lg font-bold font-mono text-[#38BDF8]">
                  {formatNumber(regionalData.testSamples)}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">Held-out test data</div>
              </div>

              <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A]">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">Anomaly Rate</div>
                <div className="text-lg font-bold font-mono text-[#F59E0B]">
                  {(regionalData.anomalyRate * 100).toFixed(1)}%
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">Training set prevalence</div>
              </div>

              <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A]">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">Local ROC-AUC</div>
                <div className="text-lg font-bold font-mono text-[#B8FF65]">
                  {(regionalData.localOnlyROCauc * 100).toFixed(1)}%
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">Local-only model</div>
              </div>

              <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A] col-span-2">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">Local F1 Score</div>
                <div className="text-lg font-bold font-mono text-[#818CF8]">
                  {(regionalData.localOnlyF1 * 100).toFixed(1)}%
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">Isolated client performance</div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A] text-sm text-slate-400">
              Regional data not available
            </div>
          )}
        </section>

        {/* Federated Learning Status */}
        <section>
          <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[#B8FF65]" />
            FL Participation
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0A1422] border border-[#14243A]">
              <span className="text-xs text-slate-400">Privacy Budget</span>
              <span className="font-mono text-sm font-semibold text-[#B8FF65]">
                {formatEpsilon()}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0A1422] border border-[#14243A]">
              <span className="text-xs text-slate-400">Rounds</span>
              <span className="font-mono text-xs text-slate-300">
                {TRAINING_STATUS.roundsCompleted}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0A1422] border border-[#14243A]">
              <span className="text-xs text-slate-400">Model</span>
              <span className="font-mono text-xs text-slate-300">
                DP-FedAvg
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0A1422] border border-[#14243A]">
              <span className="text-xs text-slate-400">Aggregation Mode</span>
              <span className="font-mono text-xs text-[#38BDF8]">
                DP-FedAvg
              </span>
            </div>
          </div>
        </section>

        {/* Data Sources */}
        <section>
          <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-[#38BDF8]" />
            Data Sources
          </h3>

          <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Source</span>
              <span className="font-mono text-[#B8FF65]">Simulated regional client data</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Data Retention</span>
              <span className="font-mono text-slate-200">Local Only</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Privacy</span>
              <span className="font-mono text-slate-200">Federated (No raw data shared)</span>
            </div>
          </div>
        </section>

        {/* Important Notice */}
        <div className="p-3 rounded-lg bg-[#38BDF8]/5 border border-[#38BDF8]/20">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-[#38BDF8] flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-slate-200 mb-1">
                Simulated Benchmark Data
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                This is demonstration data for research and evaluation purposes. All values are synthetically generated and do not represent actual DISCOM measurements or official grid conditions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 p-4 border-t border-[#14263D] bg-[#0A1422]/50 space-y-2">
        {isStateSupported(state.name) ? (
          !isStateView && onZoomToStateView && (
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#B8FF65]/15 hover:bg-[#B8FF65]/25 border border-[#B8FF65]/40 text-sm font-semibold text-[#B8FF65] transition-all shadow-sm"
              onClick={() => onZoomToStateView(state.name)}
            >
              <MapIcon className="w-4 h-4" />
              <span>Explore District Heatmap</span>
            </button>
          )
        ) : (
          <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-300/90 leading-tight">
            District boundary heatmap is configured for the 10 Priority States. (Selected: {state.name})
          </div>
        )}

        <button
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25 border border-[#38BDF8]/40 text-sm font-medium text-[#38BDF8] transition-all"
          onClick={() => {
            if (onNavigateToAnalysis) {
              onNavigateToAnalysis(state.name);
            }
          }}
        >
          <TrendingUp className="w-4 h-4" />
          <span>View Deep-Dive Analysis</span>
        </button>
      </div>
    </div>
  );
};
