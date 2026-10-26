import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { IndiaGridExplorer } from '../explorer/IndiaGridExplorer';
import { FederatedLearningView } from '../federated/FederatedLearningView';
import { ExperimentsView } from '../experiments/ExperimentsView';
import { DriftHealthView } from '../drift/DriftHealthView';
import { SectionPlaceholder } from '../placeholders/SectionPlaceholder';
import { InvestigationsPage, DataSourcesPage, SettingsPage } from '../placeholders/ExtraPages';
import { StateDeepDive } from '../analysis/StateDeepDive';
import { NAV_ITEMS } from '../../constants/navigation';
import type { NavItemId } from '../../types';
import { MeterIntelligencePage } from '../meters/MeterIntelligencePage';

interface AppShellProps {
  activeItem: NavItemId;
  onSelectItem: (id: NavItemId) => void;
  onReturnToLanding: () => void;
  selectedState?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeItem,
  onSelectItem,
  onReturnToLanding,
  selectedState,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [appSelectedState, setAppSelectedState] = useState<string | undefined>(selectedState);

  const handleNavigateToStateAnalysis = (stateName: string) => {
    setAppSelectedState(stateName);
    onSelectItem('state-analysis');
  };

  const currentNav = NAV_ITEMS.find((item) => item.id === activeItem) || NAV_ITEMS[0];

  const renderMainContent = () => {
    switch (activeItem) {
      // New primary routes
      case 'india-grid-explorer':
        return <IndiaGridExplorer onNavigateToStateAnalysis={handleNavigateToStateAnalysis} />;
      case 'anomaly-intelligence':
        return <MeterIntelligencePage onNavigateToInvestigations={() => onSelectItem('investigations')} />;
      case 'federated-learning':
        return <FederatedLearningView />;
      case 'experiments':
        return <ExperimentsView />;
      case 'state-analysis':
        return <StateDeepDive preselectedState={appSelectedState} onNavigateToInvestigations={() => onSelectItem('investigations')} />;
      case 'trust-model-health':
        return <DriftHealthView />;
      case 'investigations':
        return <InvestigationsPage />;
      case 'data-sources':
        return <DataSourcesPage />;
      case 'settings':
        return <SettingsPage />;

      // Legacy routes (for backward compatibility)
      case 'overview':
      case 'grid-regions':
        return <IndiaGridExplorer onNavigateToStateAnalysis={handleNavigateToStateAnalysis} />;
      case 'meter-intelligence':
        return <MeterIntelligencePage onNavigateToInvestigations={() => onSelectItem('investigations')} />;
      case 'fl-lab':
        return <FederatedLearningView />;
      case 'drift-health':
      case 'privacy-security':
        return <DriftHealthView />;

      default:
        return (
          <SectionPlaceholder
            item={currentNav}
            onBackToOverview={() => onSelectItem('india-grid-explorer')}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050B14] text-slate-100 font-sans antialiased">
      {/* Enterprise Collapsible Left Sidebar */}
      <Sidebar
        activeItem={activeItem}
        onSelectItem={onSelectItem}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onReturnToLanding={onReturnToLanding}
      />

      {/* Main App Container */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Dynamic Main Content Region */}
        <main className="flex-1 overflow-hidden relative flex flex-col">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
};