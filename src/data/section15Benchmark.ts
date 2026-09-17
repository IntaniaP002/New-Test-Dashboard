import { BaselineConfig, OperationalInput } from '../types';

/**
 * Section 15 Supervisor Benchmark Baseline (Engine 2B Post-WW clean condition)
 */
export const SECTION_15_BENCHMARK_BASELINE: BaselineConfig = {
  isConfigured: true,
  T1_7: 77.0,
  P1_7: 15.0,
  P3_0: 238.70,
  PR: 15.9133,
  realPower: 22.80,
  nphr: 2927.021,
  referenceDescription: 'Section 15 Benchmark Baseline (Engine 2B Post-WW)',
  date: '2026-08-01',
  time: '20:00',
  setAt: '2026-08-01T20:00:00.000Z',
};

/**
 * Section 15 Benchmark Series Inputs (chronological from Day 1 to Day 25)
 * As seen in the verified screenshot:
 * 2026-08-01: 77.0, 15.00, 238.70, PR 15.9133, Power 22.80, NPHR 2927.021 (Active Baseline)
 * 2026-08-05: 77.1, 15.00, 237.80, PR 15.8533, Power 22.65, NPHR 2930.5
 * 2026-08-10: 77.2, 15.00, 236.40, PR 15.7600, Power 22.40, NPHR 2936.2
 * 2026-08-15: 77.3, 15.00, 235.10, PR 15.6733, Power 22.15, NPHR 2942.8
 * 2026-08-20: 77.4, 15.00, 233.80, PR 15.5867, Power 21.85, NPHR 2949.1
 * 2026-08-25: 77.5, 15.00, 232.50, PR 15.5000, Power 21.60, NPHR 2955.835
 */
export const SECTION_15_BENCHMARK_RECORDS: OperationalInput[] = [
  {
    date: '2026-08-01',
    time: '20:00',
    T1_7: 77.0,
    P1_7: 15.00,
    P3_0: 238.70,
    realPower: 22.80,
    nphr: 2927.021,
    notes: 'Section 15 Clean Condition Baseline (Engine 2B Post-WW)',
  },
  {
    date: '2026-08-05',
    time: '20:00',
    T1_7: 77.1,
    P1_7: 15.00,
    P3_0: 237.80,
    realPower: 22.65,
    nphr: 2930.5,
  },
  {
    date: '2026-08-10',
    time: '20:00',
    T1_7: 77.2,
    P1_7: 15.00,
    P3_0: 236.40,
    realPower: 22.40,
    nphr: 2936.2,
  },
  {
    date: '2026-08-15',
    time: '20:00',
    T1_7: 77.3,
    P1_7: 15.00,
    P3_0: 235.10,
    realPower: 22.15,
    nphr: 2942.8,
  },
  {
    date: '2026-08-20',
    time: '20:00',
    T1_7: 77.4,
    P1_7: 15.00,
    P3_0: 233.80,
    realPower: 21.85,
    nphr: 2949.1,
  },
  {
    date: '2026-08-25',
    time: '20:00',
    T1_7: 77.5,
    P1_7: 15.00,
    P3_0: 232.50,
    realPower: 21.60,
    nphr: 2955.835,
    notes: 'Section 15 Benchmark Fouled Condition (Recommend Water Wash)',
  },
];
