import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Globe2,
  Map as MapIcon,
  Zap,
  Filter,
  Compass,
  Radio,
  Network,
  Layers,
  Tag,
  Activity,
} from 'lucide-react';
import type { GridRegionCode } from '../../types/grid';

export interface GridControlsProps {
  is3D: boolean;
  onToggle3D: () => void;
  showCorridors: boolean;
  onToggleCorridors: () => void;
  showNodes?: boolean;
  onToggleNodes?: () => void;
  showFLLinks?: boolean;
  onToggleFLLinks?: () => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  showLabels?: boolean;
  onToggleLabels?: () => void;
  showFLOverlay?: boolean;
  onToggleFLOverlay?: () => void;
  selectedRegionFilter: GridRegionCode | 'ALL';
  onSelectRegionFilter: (region: GridRegionCode | 'ALL') => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  cameraPreset?: 'india' | 'overview';
  onTogglePreset?: () => void;
}

export const GridControls = ({
  is3D,
  onToggle3D,
  showCorridors,
  onToggleCorridors,
  showNodes = true,
  onToggleNodes,
  showFLLinks = true,
  onToggleFLLinks,
  showHeatmap = true,
  onToggleHeatmap,
  showLabels = true,
  onToggleLabels,
  showFLOverlay = false,
  onToggleFLOverlay,
  selectedRegionFilter,
  onSelectRegionFilter,
  onResetView,
  onZoomIn,
  onZoomOut,
  cameraPreset = 'india',
  onTogglePreset,
}: GridControlsProps) => {
  const regions: (GridRegionCode | 'ALL')[] = ['ALL', 'NR', 'WR', 'SR', 'ER', 'NER'];

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2.5 pointer-events-auto select-none">
      {/* Primary Action Button Cluster */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-[#07111F]/90 backdrop-blur-md border border-[#14263D] shadow-xl">
        {/* 2D / 3D Toggle */}
        <button
          onClick={onToggle3D}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium transition-all focus-visible:ring-1 focus-visible:ring-[#38BDF8] outline-none ${
            is3D
              ? 'bg-[#0E2036] text-[#B8FF65] border border-[#B8FF65]/40 shadow-[0_0_10px_rgba(184,255,101,0.2)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#0A1626]'
          }`}
          title={is3D ? 'Switch to 2.5D Planar Grid' : 'Switch to 3D Curved Globe'}
          aria-label={is3D ? 'Switch to 2.5D Planar Grid' : 'Switch to 3D Curved Globe'}
        >
          {is3D ? <Globe2 className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
          <span>{is3D ? '3D GLOBE' : '2D PLANAR'}</span>
        </button>

        {/* Camera Preset Toggle (3D Mode) */}
        {is3D && onTogglePreset && (
          <>
            <div className="w-[1px] h-4 bg-[#14263D]" />
            <button
              onClick={onTogglePreset}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium transition-all focus-visible:ring-1 focus-visible:ring-[#38BDF8] outline-none ${
                cameraPreset === 'india'
                  ? 'bg-[#0E2036] text-[#38BDF8] border border-[#38BDF8]/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                  : 'text-slate-300 hover:text-white hover:bg-[#0A1626] border border-transparent'
              }`}
              title={
                cameraPreset === 'india'
                  ? 'Current: India Focus (click for Earth Overview)'
                  : 'Current: Earth Overview (click for India Focus)'
              }
              aria-label={
                cameraPreset === 'india'
                  ? 'Switch camera to Earth Overview'
                  : 'Switch camera to India Focus'
              }
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{cameraPreset === 'india' ? 'INDIA FOCUS' : 'EARTH OVERVIEW'}</span>
            </button>
          </>
        )}

        <div className="w-[1px] h-4 bg-[#14263D]" />

        {/* Recenter India Action (Restores exact India Focus framing) */}
        <button
          onClick={onResetView}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-mono font-medium text-slate-300 hover:text-white hover:bg-[#0E2036] transition-colors focus-visible:ring-1 focus-visible:ring-[#38BDF8] outline-none"
          title="Recenter India (Restore India Focus framing)"
          aria-label="Recenter India"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[#38BDF8]" />
          <span className="hidden sm:inline">RECENTER</span>
        </button>

        {/* Zoom In */}
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#0E1F33] transition-colors focus-visible:ring-1 focus-visible:ring-[#38BDF8] outline-none"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Out */}
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#0E1F33] transition-colors focus-visible:ring-1 focus-visible:ring-[#38BDF8] outline-none"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Layer Visibility Control Strip */}
      <div className="flex items-center gap-1 p-1 rounded-md bg-[#07111F]/85 backdrop-blur-md border border-[#14263D] shadow-lg">
        <div className="flex items-center gap-1 px-1.5 text-[10px] font-mono text-slate-500">
          <Layers className="w-3 h-3 text-[#38BDF8]" />
          <span className="hidden md:inline">LAYERS:</span>
        </div>

        {/* Corridors Toggle */}
        <button
          onClick={onToggleCorridors}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
            showCorridors
              ? 'bg-[#0E2036] text-[#38BDF8] border border-[#38BDF8]/40'
              : 'text-slate-500 hover:text-slate-300 hover:bg-[#0A1626]'
          }`}
          title="Toggle Transmission Corridors"
          aria-label="Toggle Transmission Corridors"
        >
          <Zap className="w-3 h-3" />
          <span>CORRIDORS</span>
        </button>

        {/* Nodes Toggle */}
        {onToggleNodes && (
          <button
            onClick={onToggleNodes}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
              showNodes
                ? 'bg-[#0E2036] text-[#B8FF65] border border-[#B8FF65]/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#0A1626]'
            }`}
            title="Toggle Regional DISCOM / Client Nodes"
            aria-label="Toggle Regional Nodes"
          >
            <Radio className="w-3 h-3" />
            <span>NODES</span>
          </button>
        )}

        {/* FL Links Toggle */}
        {onToggleFLLinks && (
          <button
            onClick={onToggleFLLinks}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
              showFLLinks
                ? 'bg-[#0E2036] text-[#38BDF8] border border-[#38BDF8]/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#0A1626]'
            }`}
            title="Toggle Federated Learning Communication Links"
            aria-label="Toggle FL Links"
          >
            <Network className="w-3 h-3" />
            <span>FL LINKS</span>
          </button>
        )}

        {/* Heatmap Toggle */}
        {onToggleHeatmap && (
          <button
            onClick={onToggleHeatmap}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
              showHeatmap
                ? 'bg-[#0E2036] text-[#B8FF65] border border-[#B8FF65]/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#0A1626]'
            }`}
            title="Toggle Anomaly Heatmap Coloring"
            aria-label="Toggle Anomaly Heatmap"
          >
            <Layers className="w-3 h-3" />
            <span>HEATMAP</span>
          </button>
        )}

        {/* Labels Toggle */}
        {onToggleLabels && (
          <button
            onClick={onToggleLabels}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
              showLabels
                ? 'bg-[#0E2036] text-slate-200 border border-slate-600'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#0A1626]'
            }`}
            title="Toggle Regional & City Labels"
            aria-label="Toggle Labels"
          >
            <Tag className="w-3 h-3" />
            <span>LABELS</span>
          </button>
        )}

        {/* FL Overlay Panel Toggle */}
        {onToggleFLOverlay && (
          <button
            onClick={onToggleFLOverlay}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-medium transition-all ${
              showFLOverlay
                ? 'bg-[#B8FF65]/20 text-[#B8FF65] border border-[#B8FF65]/60 shadow-[0_0_12px_rgba(184,255,101,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#0A1626]'
            }`}
            title="Toggle Federated Learning Network Intelligence Overlay"
            aria-label="Toggle FL Overlay"
          >
            <Activity className="w-3 h-3 text-[#B8FF65]" />
            <span>FL OVERLAY</span>
          </button>
        )}
      </div>

      {/* Regional Synchronous Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-md bg-[#07111F]/85 backdrop-blur-md border border-[#14263D] shadow-lg">
        <div className="flex items-center gap-1 px-1.5 text-[10px] font-mono text-slate-500">
          <Filter className="w-3 h-3 text-[#B8FF65]" />
          <span className="hidden md:inline">FILTER:</span>
        </div>
        {regions.map((reg) => {
          const isSelected = selectedRegionFilter === reg;
          return (
            <button
              key={reg}
              onClick={() => onSelectRegionFilter(reg)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                isSelected
                  ? 'bg-[#B8FF65]/15 text-[#B8FF65] border border-[#B8FF65]/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0B1829]'
              }`}
            >
              {reg}
            </button>
          );
        })}
      </div>
    </div>
  );
};
