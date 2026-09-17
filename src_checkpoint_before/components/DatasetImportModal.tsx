import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Sparkles,
  Upload,
  X,
  ArrowRight,
  Download,
  Filter,
  CheckCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { OperationalInput } from '../types';
import {
  autoNormalizeDiamondData,
  ColumnMappingResult,
  exportToStandardCsv,
  FIELD_PATTERNS,
} from '../utils/dataNormalizer';

interface DatasetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportData: (records: OperationalInput[], setAsBaseline?: boolean) => void;
  onLoadReferenceCase: () => void;
}

export const DatasetImportModal: React.FC<DatasetImportModalProps> = ({
  isOpen,
  onClose,
  onImportData,
  onLoadReferenceCase,
}) => {
  const [csvText, setCsvText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<OperationalInput[]>([]);
  const [autoSetBaseline, setAutoSetBaseline] = useState(true);
  const [mappingResult, setMappingResult] = useState<ColumnMappingResult | null>(null);
  const [showMappingDetails, setShowMappingDetails] = useState(false);
  const [filter19to21Only, setFilter19to21Only] = useState(false);

  if (!isOpen) return null;

  const parseCsvContent = (text: string, fileName?: string | null) => {
    setParseError(null);
    if (!text.trim()) {
      setParseError('Please paste CSV text or select a file first.');
      return;
    }

    try {
      // Use intelligent auto-normalizer that handles disordered columns, comma decimals, tags, etc.
      const result = autoNormalizeDiamondData(text, fileName || undefined);

      if (result.extractedRecords.length === 0) {
        setParseError(
          result.warnings.length > 0
            ? result.warnings.join(' ')
            : 'No valid data rows could be extracted. Please ensure required turbine parameters (P1.7, P3.0, Real Power, NPHR) exist in the file.'
        );
        setMappingResult(result);
        return;
      }

      setMappingResult(result);
      setPreviewRows(result.extractedRecords);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to parse file.';
      setParseError(`Parse error: ${errMsg}`);
    }
  };

  const handleParse = () => {
    parseCsvContent(csvText, uploadedFileName);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Convert sheet into CSV text for uniform parsing
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          setCsvText(csv);
          parseCsvContent(csv, file.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error reading Excel file';
          setParseError(`Failed to parse Excel file: ${msg}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvText(text);
        parseCsvContent(text, file.name);
      };
      reader.readAsText(file);
    }
  };

  // Filter rows if user chooses representative operating window (19:00 - 21:00 or >21MW)
  const displayedRows = filter19to21Only
    ? previewRows.filter((r) => {
        const h = parseInt(r.time?.slice(0, 2) || '0', 10);
        return (h >= 19 && h <= 21) || r.realPower >= 21.0;
      })
    : previewRows;

  const handleConfirmImport = () => {
    if (displayedRows.length > 0) {
      onImportData(displayedRows, autoSetBaseline);
      onClose();
    }
  };

  const handleDownloadStandardized = () => {
    if (displayedRows.length === 0) return;
    const csvData = exportToStandardCsv(displayedRows);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `standardized_operational_data_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadStandardizedExcel = () => {
    if (displayedRows.length === 0) return;
    const rows = displayedRows.map((r) => ({
      Date: r.date,
      Time: r.time,
      'P1.7 (PSIA)': r.P1_7,
      'P3.0 (PSIA)': r.P3_0,
      PR: r.P1_7 > 0 ? Number((r.P3_0 / r.P1_7).toFixed(4)) : null,
      'Real Power (MW)': r.realPower,
      'NPHR (kcal/kWh)': r.nphr,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Standardized Data');
    XLSX.writeFile(wb, `standardized_operational_data_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-700" />
              <h3 className="text-base font-bold text-slate-900">Import Operational Dataset</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCheck className="w-3 h-3" /> Auto-Format Enabled
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste or upload raw Diamond exports in <strong>any column order</strong>. The system automatically identifies required parameters and reorders them into our standardized monitoring format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Area */}
        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Select Data CSV / Excel (.xlsx)</span>
                {uploadedFileName && (
                  <span className="text-sky-700 font-semibold">({uploadedFileName})</span>
                )}
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt,.tsv"
                onChange={handleFileUpload}
                className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
              />
            </div>
            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste raw data here or upload CSV / Excel (.xlsx):&#10;Power_MW, Jam, NPHR, Tanggal, P3_0, P1_7&#10;23.4, 20:00, 3447.1, 2024-11-05, 243.8, 14.58&#10;22.8, 20:00, 3438.7, 2025-01-16, 241.4, 14.57"
              className="w-full p-2.5 font-mono text-xs border border-slate-300 rounded bg-slate-50 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleParse}
                className="px-3.5 py-1.5 text-xs font-semibold bg-sky-700 text-white rounded hover:bg-sky-800 shadow-xs transition-colors"
              >
                Auto-Extract & Standardize Format
              </button>

              {mappingResult && (
                <button
                  type="button"
                  onClick={() => setShowMappingDetails(!showMappingDetails)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                >
                  {showMappingDetails ? 'Hide Column Mapping' : 'View Detected Column Mapping'}
                </button>
              )}
            </div>

            {/* Quick Demo Case Button */}
            <button
              type="button"
              onClick={() => {
                onLoadReferenceCase();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200 transition-colors"
              title="Load demo reference case"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Load Reference Validation Dataset</span>
            </button>
          </div>

          {/* Column Mapping Inspection Drawer */}
          {mappingResult && showMappingDetails && (
            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-md space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-bold text-slate-900">Automated Column Detection & Normalization Map</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Delimiter detected: '{mappingResult.detectedDelimiter === '\t' ? 'TAB' : mappingResult.detectedDelimiter}'
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                {mappingResult.mappedHeaders.map((m) => (
                  <div key={m.targetField} className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-slate-500 font-medium">Target Field:</div>
                    <div className="font-bold text-sky-800">{m.targetField}</div>
                    <div className="flex items-center gap-1 mt-1 text-slate-600">
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="truncate font-mono" title={m.detectedColumn}>
                        {m.detectedColumn || '<Not found>'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {mappingResult.unmappedColumns.length > 0 && (
                <div className="pt-1 text-[11px] text-slate-500">
                  <span className="font-medium">Ignored extra Diamond columns: </span>
                  {mappingResult.unmappedColumns.map((c) => c.columnName).join(', ')}
                </div>
              )}
            </div>
          )}

          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Preview Table & Controls */}
          {previewRows.length > 0 && (
            <div className="space-y-3 border border-slate-200 rounded-md p-3.5 bg-slate-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-xs text-slate-900">
                    Standardized {displayedRows.length} of {previewRows.length} rows
                  </span>
                </div>

                {/* Filter option */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilter19to21Only(!filter19to21Only)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                      filter19to21Only
                        ? 'bg-amber-600 text-white border-amber-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                    title="Filter to 19:00-21:00 or >21MW operating condition"
                  >
                    <Filter className="w-3 h-3" />
                    <span>{filter19to21Only ? 'Showing 19-21h / >21MW Only' : 'Filter 19-21h'}</span>
                  </button>
                </div>
              </div>

              {/* Baseline Option & Export Link */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs px-1 gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={autoSetBaseline}
                    onChange={(e) => setAutoSetBaseline(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                  />
                  <span>Set 1st record as Initial Baseline Reference</span>
                </label>
                
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadStandardized}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline"
                    title="Download standardized CSV file formatted with Date, Time, P1.7, P3.0, PR, RealPower, NPHR"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadStandardizedExcel}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
                    title="Download standardized Excel (.xlsx) file"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Excel (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Standardized Table Preview */}
              <div className="overflow-x-auto max-h-56 border border-slate-200 rounded bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">P1.7 (PSIA)</th>
                      <th className="py-2 px-3">P3.0 (PSIA)</th>
                      <th className="py-2 px-3">PR (Calc)</th>
                      <th className="py-2 px-3">Power (MW)</th>
                      <th className="py-2 px-3">NPHR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {displayedRows.map((r, idx) => {
                      const pr = r.P1_7 > 0 ? (r.P3_0 / r.P1_7).toFixed(4) : '—';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-medium text-slate-900 whitespace-nowrap">{r.date}</td>
                          <td className="py-1.5 px-3 text-slate-600 whitespace-nowrap">{r.time}</td>
                          <td className="py-1.5 px-3 text-slate-800">{r.P1_7.toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-slate-800">{r.P3_0.toFixed(2)}</td>
                          <td className="py-1.5 px-3 font-mono font-medium text-slate-700">{pr}</td>
                          <td className="py-1.5 px-3 text-slate-800">{r.realPower.toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-slate-800">{r.nphr.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {displayedRows.length > 0
              ? `${displayedRows.length} standardized rows ready`
              : 'Paste or upload Diamond data to begin'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={displayedRows.length === 0}
              onClick={handleConfirmImport}
              className="px-4 py-2 text-xs font-bold text-white bg-sky-700 rounded hover:bg-sky-800 disabled:opacity-50 shadow-xs transition-colors"
            >
              Import {displayedRows.length} Standardized Records
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
