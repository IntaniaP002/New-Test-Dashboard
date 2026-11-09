import React, { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, X, Check, Filter } from 'lucide-react';
import { RecordAnomalyReport } from '../utils/anomalyValidation';

interface AnomalyWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSubmitAnyway: () => void;
  onExcludeAnomaliesAndContinue?: () => void;
  reports: RecordAnomalyReport[];
  mode?: 'single' | 'bulk';
  title?: string;
  submitAnywayLabel?: string;
}

export const AnomalyWarningModal: React.FC<AnomalyWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirmSubmitAnyway,
  onExcludeAnomaliesAndContinue,
  reports,
  mode = 'single',
  title = 'Peringatan Anomali Data Unggahan (Import Data)',
  submitAnywayLabel = 'Tetap Simpan',
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('ALL');

  // Extract all unique dates from anomaly reports
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.date) set.add(r.date);
    });
    return Array.from(set).sort();
  }, [reports]);

  // Filter reports by selected date
  const displayedReports = useMemo(() => {
    if (selectedDate === 'ALL') return reports;
    return reports.filter((r) => r.date === selectedDate);
  }, [reports, selectedDate]);

  if (!isOpen || reports.length === 0) return null;

  const totalIssues = reports.reduce((acc, r) => acc + r.issues.length, 0);

  // Helper to check if a specific field is flagged as an anomaly in this report
  const isFieldAnomalous = (rep: RecordAnomalyReport, fieldName: string) => {
    return rep.issues.some((iss) => iss.field === fieldName);
  };

  return (
    <div
      id="anomaly-warning-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        id="anomaly-warning-modal"
        className="bg-white rounded-xl shadow-2xl border border-amber-300 max-w-4xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200 bg-amber-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 border border-amber-300">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-amber-800 font-medium">
                Data Anda berpotensi tidak valid. Silakan periksa kembali data Anda.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Summary Banner */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  {mode === 'single'
                    ? 'Peringatan Parameter Operasi:'
                    : `Terdeteksi ${reports.length} data dengan total ${totalIssues} potensi anomali:`}
                </span>{' '}
                <span>
                  {mode === 'single'
                    ? 'Satu atau lebih nilai parameter yang dimasukkan berada di luar batas operasional turbin yang diharapkan.'
                    : 'Berikut adalah rincian data aktual dari baris yang terdeteksi memiliki nilai di luar batas normal.'}
                </span>
              </div>
            </div>

            {/* Date Filter (for bulk mode when data is large) */}
            {mode === 'bulk' && availableDates.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs shadow-2xs shrink-0 self-end sm:self-auto">
                <Filter className="w-3.5 h-3.5 text-amber-700" />
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-transparent border-0 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Tanggal ({reports.length} anomali)</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d} ({reports.filter((r) => r.date === d).length} anomali)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* FULL SPREADSHEET TABLE OF EXACT ANOMALY ROWS */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
            <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Data Aktual Baris Terdeteksi Anomali ({displayedReports.length} Baris)
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Kolom berlatar merah (<span className="text-rose-700 font-bold bg-rose-50 px-1 border border-rose-200 rounded">merah</span>) menandakan nilai anomali
              </span>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 sticky top-0 font-semibold text-[11px]">
                  <tr>
                    {mode === 'bulk' && <th className="py-2 px-3 whitespace-nowrap">Baris</th>}
                    <th className="py-2 px-3 whitespace-nowrap">Tanggal & Waktu</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">P1.7 (PSIA)</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">P3.0 (PSIA)</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">PR (Calc)</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">Power (MW)</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">NPHR</th>
                    <th className="py-2 px-3 whitespace-nowrap">Keterangan Anomali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {displayedReports.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        Tidak ada data anomali pada tanggal yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    displayedReports.map((rep, idx) => {
                      const p1Anomaly = isFieldAnomalous(rep, 'P1_7');
                      const p3Anomaly = isFieldAnomalous(rep, 'P3_0');
                      const powerAnomaly = isFieldAnomalous(rep, 'realPower');
                      const nphrAnomaly = isFieldAnomalous(rep, 'nphr');

                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          {mode === 'bulk' && (
                            <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                              #{rep.recordIndex}
                            </td>
                          )}
                          <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-800">
                            {rep.date} <span className="text-slate-400 font-normal">{rep.time || ''}</span>
                          </td>

                          {/* P1.7 Cell */}
                          <td className={`py-2.5 px-3 font-mono text-right whitespace-nowrap ${
                            p1Anomaly
                              ? 'bg-rose-100/80 text-rose-900 font-black border-x border-rose-300'
                              : 'text-slate-700'
                          }`}>
                            {rep.rowData.P1_7}
                            {p1Anomaly && <span className="ml-1 text-[10px]">⚠️</span>}
                          </td>

                          {/* P3.0 Cell */}
                          <td className={`py-2.5 px-3 font-mono text-right whitespace-nowrap ${
                            p3Anomaly
                              ? 'bg-rose-100/80 text-rose-900 font-black border-x border-rose-300'
                              : 'text-slate-700'
                          }`}>
                            {rep.rowData.P3_0}
                            {p3Anomaly && <span className="ml-1 text-[10px]">⚠️</span>}
                          </td>

                          {/* PR Cell */}
                          <td className="py-2.5 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                            {rep.rowData.pr || '—'}
                          </td>

                          {/* Real Power Cell */}
                          <td className={`py-2.5 px-3 font-mono text-right whitespace-nowrap ${
                            powerAnomaly
                              ? 'bg-rose-100/80 text-rose-900 font-black border-x border-rose-300'
                              : 'text-slate-700'
                          }`}>
                            {rep.rowData.realPower}
                            {powerAnomaly && <span className="ml-1 text-[10px]">⚠️</span>}
                          </td>

                          {/* NPHR Cell */}
                          <td className={`py-2.5 px-3 font-mono text-right whitespace-nowrap ${
                            nphrAnomaly
                              ? 'bg-rose-100/80 text-rose-900 font-black border-x border-rose-300'
                              : 'text-slate-700'
                          }`}>
                            {rep.rowData.nphr}
                            {nphrAnomaly && <span className="ml-1 text-[10px]">⚠️</span>}
                          </td>

                          {/* Issues summary */}
                          <td className="py-2.5 px-3 text-rose-800 font-medium">
                            {rep.issues.map((iss, i) => (
                              <div key={i} className="text-[11px] leading-tight">
                                &bull; {iss.message}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-1">
            <strong>Catatan Operasional:</strong> Pilih <em>&quot;Hapus Baris Anomali &amp; Lanjutkan&quot;</em> untuk membuang baris anomali dan mengimpor sisa data bersih, atau <em>&quot;Tetap Simpan Semua&quot;</em> jika data ini adalah pembacaan lapangan yang valid.
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 shrink-0">
          {mode === 'single' && (
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
            >
              Periksa Kembali
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onConfirmSubmitAnyway();
              onClose();
            }}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-amber-300 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            <span>{submitAnywayLabel}</span>
          </button>
          {onExcludeAnomaliesAndContinue && (
            <button
              type="button"
              onClick={() => {
                onExcludeAnomaliesAndContinue();
                onClose();
              }}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Hapus Baris Anomali &amp; Lanjutkan</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
