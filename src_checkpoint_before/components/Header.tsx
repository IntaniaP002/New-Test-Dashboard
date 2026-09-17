import React from 'react';
import {
  Gauge,
  Edit3,
  TrendingUp,
  FileSpreadsheet,
  Upload,
  Trash2,
  Sparkles,
  Compass,
} from 'lucide-react';
import { ActiveNavTab, OperationalRecord, OverallWaterWashStatus } from '../types';

interface HeaderProps {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  latestRecord?: OperationalRecord;
  onOpenImport: () => void;
  onOpenSpreadsheetConfig?: () => void;
  onOpenBaselineConfig?: () => void;
  recordsCount: number;
  onClearData: () => void;
  onLoadSampleData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  latestRecord,
  onOpenImport,
  onOpenSpreadsheetConfig,
  onOpenBaselineConfig,
  recordsCount,
  onClearData,
  onLoadSampleData,
}) => {
  const getStatusBadge = (status?: OverallWaterWashStatus) => {
    switch (status) {
      case 'RECOMMEND WATER WASH':
        return (
          <span
            id="header-status-badge"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-rose-300 bg-rose-50 text-rose-800 font-bold text-xs tracking-wide uppercase shadow-xs"
          >
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            Recommend Water Wash
          </span>
        );
      case 'MONITORING':
      case 'EARLY MONITORING':
        return (
          <span
            id="header-status-badge"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-amber-300 bg-amber-50 text-amber-900 font-bold text-xs tracking-wide uppercase"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Monitoring
          </span>
        );
      case 'NORMAL':
        return (
          <span
            id="header-status-badge"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 font-bold text-xs tracking-wide uppercase"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Normal
          </span>
        );
      default:
        return (
          <span
            id="header-status-badge"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600 font-medium text-xs tracking-wide uppercase"
          >
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Awaiting Data
          </span>
        );
    }
  };

  const navItems: { id: ActiveNavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Gauge className="w-4 h-4" /> },
    { id: 'input', label: 'Input Data', icon: <Edit3 className="w-4 h-4" /> },
    { id: 'trend', label: 'Performance Trend', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-xs">
            <Gauge className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight">
              Water Washing Monitoring
            </h1>
            <p className="text-xs text-slate-500">
              Condition-based monitoring & automated Water Washing recommendation
            </p>
          </div>
        </div>

        {/* Status Badge and Actions */}
        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-center">
          {getStatusBadge(latestRecord?.overallStatus)}

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            {onOpenBaselineConfig && (
              <button
                type="button"
                onClick={onOpenBaselineConfig}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
                title="View and Change Baseline Calibration Reference"
              >
                <Compass className="w-3.5 h-3.5 text-sky-600" />
                <span className="hidden sm:inline">Baseline</span>
              </button>
            )}

            {onOpenSpreadsheetConfig && (
              <button
                type="button"
                onClick={onOpenSpreadsheetConfig}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
                title="Google Spreadsheet Storage Settings"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Google Sheets</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
              title="Import Dataset"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Import</span>
            </button>

            {recordsCount > 0 ? (
              <button
                type="button"
                onClick={onClearData}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors shadow-xs"
                title="Clear all data and start fresh"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Clear Data</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoadSampleData}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
                title="Load sample dataset for demo purposes"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Demo Data</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3 Main Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-2 border-t border-slate-100 py-1" aria-label="Tabs">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`px-4 py-2.5 text-xs font-semibold rounded-t-md transition-colors flex items-center gap-2 border-b-2 ${
                  isActive
                    ? 'border-slate-900 text-slate-900 bg-slate-50'
                    : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span className={isActive ? 'text-slate-900' : 'text-slate-400'}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
