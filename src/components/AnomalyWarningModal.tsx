import React from 'react';
import { AlertTriangle, AlertCircle, X, Check, ArrowRight } from 'lucide-react';
import { RecordAnomalyReport } from '../utils/anomalyValidation';

interface AnomalyWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSubmitAnyway: () => void;
  reports: RecordAnomalyReport[];
  mode?: 'single' | 'bulk';
  title?: string;
  submitAnywayLabel?: string;
}

export const AnomalyWarningModal: React.FC<AnomalyWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirmSubmitAnyway,
  reports,
  mode = 'single',
  title = 'Data Berpotensi Tidak Valid / Anomali',
  submitAnywayLabel = 'Tetap Simpan',
}) => {
  if (!isOpen || reports.length === 0) return null;

  const totalIssues = reports.reduce((acc, r) => acc + r.issues.length, 0);

  return (
    <div
      id="anomaly-warning-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        id="anomaly-warning-modal"
        className="bg-white rounded-xl shadow-2xl border border-amber-300 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-100 bg-amber-50/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 border border-amber-300">
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
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
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
                  : 'Beberapa baris data yang diunggah memiliki parameter yang berada di luar rentang normal atau format standar turbin.'}
              </span>
            </div>
          </div>

          {/* List of Anomalies */}
          <div className="space-y-3">
            {reports.map((rep, idx) => (
              <div
                key={idx}
                className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 text-xs space-y-2"
              >
                {/* Header of Report (if bulk) */}
                {mode === 'bulk' && (
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 font-bold text-slate-800">
                    <span>
                      Baris #{rep.recordIndex}{' '}
                      {rep.date && (
                        <span className="text-slate-500 font-normal">
                          ({rep.date} {rep.time || ''})
                        </span>
                      )}
                    </span>
                    <span className="text-rose-700 font-semibold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">
                      {rep.issues.length} {rep.issues.length === 1 ? 'Anomali' : 'Anomali'}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {rep.issues.map((iss, i) => (
                    <div
                      key={i}
                      className="p-2.5 bg-white border border-rose-200 rounded-md shadow-2xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-rose-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          {iss.fieldLabel}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Aturan: {iss.expectedRule}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                        {iss.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-slate-500 pt-1">
            <strong>Catatan Operasional:</strong> Anda dapat memilih <em>&quot;Periksa Kembali&quot;</em> untuk memperbaiki data, atau <em>&quot;Tetap Simpan&quot;</em> jika data ini adalah pembacaan lapangan yang valid (misalnya saat kondisi uji coba atau transient load).
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
          >
            Periksa Kembali
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmSubmitAnyway();
              onClose();
            }}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{submitAnywayLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
