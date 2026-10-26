/**
 * IndiaGridExplorer — The core immersive experience of UrjaSetu.
 * 
 * Dual-mode interactive explorer:
 * 
 * 1. **National View (3D Globe)** — Full-screen interactive globe focused on India with
 *    selectable state boundaries, smooth camera transitions, contextual state intelligence
 *    panels, regional grid node visualization, and transmission corridor overlays.
 * 
 * 2. **State View (District Heatmap)** — Focused district-level anomaly heatmap for
 *    selected priority states using real district boundaries from Survey of India GeoJSON
 *    and DP-FedAvg model stream data.
 * 
 * Includes an FL Network Overlay panel displaying participating regional clients,
 * completed rounds, privacy budget, and benchmark comparisons.
 * 
 * This is the primary landing experience after the cinematic Earth intro.
 */

import { useState, useCallback } from 'react';
import { IndiaGrid3D } from '../visualization/IndiaGrid3D';
import { StateDetailCard, type SelectedStateData } from '../visualization/StateDetailCard';
import { FLNetworkOverlay } from '../visualization/FLNetworkOverlay';
import { StateDeepDive } from '../analysis/StateDeepDive';
import { isStateSupported, SUPPORTED_STATES } from '../../constants/supportedStates';
import { 
  TRAINING_STATUS, 
  REGIONAL_CLIENTS, 
  TOTAL_DISCOM_NODES,
  MODEL_PERFORMANCE 
} from '../../data/projectFacts';
import { Globe2, Map as MapIcon, ArrowLeft, ChevronRight } from 'lucide-react';

type ViewMode = 'national' | 'state';

export const IndiaGridExplorer: React.FC<{ onNavigateToStateAnalysis?: (state: string) => void }> = ({ onNavigateToStateAnalysis }) => {
  const [selectedState, setSelectedState] = useState<SelectedStateData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('national');
  const [stateViewTarget, setStateViewTarget] = useState<string>(SUPPORTED_STATES[0]);
  const [showFLOverlay, setShowFLOverlay] = useState<boolean>(false);

  const handleZoomToStateView = useCallback((stateName: string) => {
    if (isStateSupported(stateName)) {
      setStateViewTarget(stateName);
      setViewMode('state');
      setSelectedState(null);
    }
  }, []);

  const handleReturnToNational = useCallback(() => {
    setViewMode('national');
    setSelectedState(null);
  }, []);

  const handleToggleFLOverlay = useCallback(() => {
    setShowFLOverlay(prev => !prev);
  }, []);

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-[#050B14]">
      {/* Main Column: Globe/District + Metrics */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* View Mode Indicator / Breadcrumb Bar */}
        {viewMode === 'state' && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-[#14263D] bg-[#060E1A]/90 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button
                onClick={handleReturnToNational}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0A1626] hover:bg-[#0E2036] border border-[#1A3350] text-sm font-mono text-[#38BDF8] hover:text-white transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <Globe2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">National Grid</span>
              </button>

              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <span className="text-slate-500">3D Globe</span>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <span className="text-[#B8FF65] font-medium">{stateViewTarget}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-500">District Heatmap</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 rounded bg-[#B8FF65]/10 border border-[#B8FF65]/25 text-[10px] font-mono text-[#B8FF65]">
                <MapIcon className="w-3 h-3 inline mr-1" />
                STATE VIEW
              </div>
            </div>
          </div>
        )}

        {/* Primary Content Area */}
        {viewMode === 'national' ? (
          <>
            {/* Globe Section - flexible height */}
            <div className="flex-1 relative p-4 min-h-0">
              <IndiaGrid3D
                onStateSelect={setSelectedState}
                showFLOverlay={showFLOverlay}
                onToggleFLOverlay={handleToggleFLOverlay}
              />

              {/* FL Network Overlay */}
              <FLNetworkOverlay
                visible={showFLOverlay}
                onClose={() => setShowFLOverlay(false)}
              />
            </div>

            {/* Metrics Section - below globe */}
            <div className="flex-shrink-0 px-4 pb-4 space-y-3 overflow-y-auto max-h-[300px]">
              {/* Top Row: 4 Metrics */}
              <div className="grid grid-cols-4 gap-3">
                <MetricCard 
                  label="Regions"
                  value={REGIONAL_CLIENTS.count}
                  unit={`${TOTAL_DISCOM_NODES} DISCOMs`}
                />
                <MetricCard 
                  label="FL Rounds"
                  value={`${TRAINING_STATUS.roundsCompleted} / ${TRAINING_STATUS.roundsPlanned}`}
                  unit="completed"
                />
                <MetricCard 
                  label="Global ROC-AUC"
                  value={`${(MODEL_PERFORMANCE.testRocAuc * 100).toFixed(1)}%`}
                  unit="test set"
                />
                <MetricCard 
                  label="Test Samples"
                  value="796"
                  unit="held-out"
                />
              </div>

              {/* Bottom Row: 3 Comparison Cards */}
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <ComparisonCard 
                    paradigm="Local-only"
                    rocAuc={0.805}
                    note="Isolated per-region"
                  />
                  <ComparisonCard 
                    paradigm="Federated (UrjaSetu)"
                    rocAuc={0.860}
                    note="DP-FedAvg"
                    highlight={true}
                  />
                  <ComparisonCard 
                    paradigm="Centralized"
                    rocAuc={0.893}
                    note="Upper bound"
                  />
                </div>
                <div className="text-xs text-slate-400 text-center font-sans px-3">
                  Federated learning approaches the centralized ceiling without sharing raw data
                </div>
              </div>
            </div>
          </>
        ) : (
          /* State District Heatmap View */
          <div className="flex-1 overflow-hidden">
            <StateDeepDive preselectedState={stateViewTarget} />
          </div>
        )}
      </div>

      {/* State Detail Panel - fixed width on the right, hidden when no state selected */}
      {selectedState && viewMode === 'national' && (
        <div className="w-[340px] h-full border-l border-[#14243A] bg-[#060E1A] flex flex-col overflow-hidden shrink-0">
          <StateDetailCard
            state={selectedState}
            onClose={() => setSelectedState(null)}
            onNavigateToAnalysis={onNavigateToStateAnalysis}
            onZoomToStateView={handleZoomToStateView}
          />
        </div>
      )}
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  unit: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, unit }) => (
  <div className="p-3 rounded-lg bg-[#0A1422] border border-[#14243A] flex flex-col justify-center">
    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
      {label}
    </div>
    <div className="text-lg font-bold font-mono text-[#B8FF65]">
      {value}
    </div>
    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
      {unit}
    </div>
  </div>
);

interface ComparisonCardProps {
  paradigm: string;
  rocAuc: number;
  note: string;
  highlight?: boolean;
}

const ComparisonCard: React.FC<ComparisonCardProps> = ({ paradigm, rocAuc, note, highlight }) => (
  <div className={`p-3 rounded-lg border ${
    highlight 
      ? 'bg-[#38BDF8]/10 border-[#38BDF8]/40' 
      : 'bg-[#0A1422] border-[#14243A]'
  }`}>
    <div className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-2">
      {paradigm}
    </div>
    <div className={`text-2xl font-bold font-mono ${
      highlight ? 'text-[#38BDF8]' : 'text-[#B8FF65]'
    }`}>
      {(rocAuc * 100).toFixed(1)}%
    </div>
    <div className="text-[9px] text-slate-500 mt-1">
      {note}
    </div>
  </div>
);
