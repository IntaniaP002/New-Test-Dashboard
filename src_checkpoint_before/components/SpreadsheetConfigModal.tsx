import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, FileSpreadsheet, Send } from 'lucide-react';
import { SpreadsheetIntegrationConfig } from '../types';
import { testSpreadsheetConnection } from '../utils/spreadsheetSync';

interface SpreadsheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SpreadsheetIntegrationConfig;
  onSaveConfig: (updated: SpreadsheetIntegrationConfig) => void;
}

export const SpreadsheetConfigModal: React.FC<SpreadsheetConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl);
  const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId);
  const [sheetName, setSheetName] = useState(config.sheetName || 'OperationalData');
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; message: string; success?: boolean } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTestStatus({ loading: true, message: 'Testing connection to Google Spreadsheet...' });
    const result = await testSpreadsheetConnection({
      ...config,
      webhookUrl,
      spreadsheetId,
      sheetName,
    });
    setTestStatus({ loading: false, message: result.message, success: result.success });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...config,
      webhookUrl: webhookUrl.trim(),
      spreadsheetId: spreadsheetId.trim(),
      sheetName: sheetName.trim() || 'OperationalData',
      autoSync,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Google Spreadsheet Integration</h3>
              <p className="text-xs text-slate-500">Auto-save operator inputs directly into Google Sheets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Apps Script Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Deploy your Google Apps Script as a Web App (access: Anyone) and paste the URL here.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Spreadsheet ID (optional)
              </label>
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sheet / Tab Name
              </label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="OperationalData"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="chk-auto-sync"
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="w-4 h-4 text-sky-600 rounded border-slate-300"
            />
            <label htmlFor="chk-auto-sync" className="text-xs text-slate-700 cursor-pointer">
              Automatically stream every newly submitted reading to Google Spreadsheet
            </label>
          </div>

          {testStatus && (
            <div
              className={`p-3 rounded text-xs flex items-center gap-2 ${
                testStatus.loading
                  ? 'bg-slate-100 text-slate-700'
                  : testStatus.success
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border border-rose-300'
              }`}
            >
              {testStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{testStatus.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleTest}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            >
              Test Connection
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
