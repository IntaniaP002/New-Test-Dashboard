import { OperationalInput } from '../types';

/**
 * Clean reference dataset for initial functional validation.
 * Demonstrates:
 * - Clean baseline state
 * - Progressive fouling over 45 days
 * - 1.7% NPHR Early Monitoring trigger
 * - 3-out-of-4 condition met (NPHR + PR + P3.0 exceeding threshold) -> RECOMMEND WATER WASH
 * - WW Event #1 executed
 * - H-1 vs H+1 recovery jump
 * - Subsequent cycle fouling over 50 days leading to WW Event #2
 */
export const REFERENCE_HISTORICAL_DATASET: OperationalInput[] = [
  // Baseline / Cycle 1 Start (Clean condition)
  { date: '2024-01-01', time: '08:00', T1_7: 68.0, P1_7: 14.65, P3_0: 245.0, realPower: 156.0, nphr: 2420.0, notes: 'Clean condition baseline' },
  { date: '2024-01-08', time: '08:00', T1_7: 69.2, P1_7: 14.64, P3_0: 244.2, realPower: 155.4, nphr: 2432.0 },
  { date: '2024-01-15', time: '08:00', T1_7: 70.5, P1_7: 14.65, P3_0: 243.0, realPower: 154.5, nphr: 2445.0 },
  { date: '2024-01-22', time: '08:00', T1_7: 71.0, P1_7: 14.63, P3_0: 241.8, realPower: 153.2, nphr: 2462.0 }, // NPHR +1.73% -> Early Monitoring triggered!
  { date: '2024-01-29', time: '08:00', T1_7: 72.4, P1_7: 14.64, P3_0: 240.5, realPower: 152.0, nphr: 2478.0 },
  { date: '2024-02-05', time: '08:00', T1_7: 73.0, P1_7: 14.65, P3_0: 239.0, realPower: 150.8, nphr: 2490.0 },
  { date: '2024-02-12', time: '08:00', T1_7: 72.8, P1_7: 14.63, P3_0: 237.2, realPower: 149.6, nphr: 2498.0 }, // 3-out-of-4 thresholds met (NPHR +3.2%, PR -3.1%, P3 -3.2%)
  // H-1 before WW Event #1
  { date: '2024-02-14', time: '08:00', T1_7: 73.5, P1_7: 14.64, P3_0: 236.5, realPower: 149.0, nphr: 2505.0, notes: 'H-1 pre-wash reading' },
  // WW Event #1 execution point
  { date: '2024-02-15', time: '06:00', T1_7: 71.0, P1_7: 14.65, P3_0: 244.0, realPower: 155.0, nphr: 2428.0, isWaterWashEvent: true, waterWashEventNumber: 1, notes: 'Off-line crank water wash with detergent' },
  // H+1 after WW Event #1
  { date: '2024-02-16', time: '08:00', T1_7: 71.5, P1_7: 14.65, P3_0: 244.2, realPower: 155.2, nphr: 2426.0, notes: 'H+1 post-wash recovery reading' },

  // Cycle 2 degradation
  { date: '2024-02-23', time: '08:00', T1_7: 72.0, P1_7: 14.64, P3_0: 243.6, realPower: 154.6, nphr: 2435.0 },
  { date: '2024-03-02', time: '08:00', T1_7: 73.2, P1_7: 14.63, P3_0: 242.4, realPower: 153.8, nphr: 2448.0 },
  { date: '2024-03-10', time: '08:00', T1_7: 74.0, P1_7: 14.65, P3_0: 241.0, realPower: 152.5, nphr: 2465.0 }, // Early monitoring
  { date: '2024-03-18', time: '08:00', T1_7: 75.1, P1_7: 14.64, P3_0: 239.5, realPower: 151.2, nphr: 2482.0 },
  { date: '2024-03-26', time: '08:00', T1_7: 76.0, P1_7: 14.65, P3_0: 238.0, realPower: 150.0, nphr: 2496.0 },
  // H-1 before WW Event #2
  { date: '2024-04-04', time: '08:00', T1_7: 76.5, P1_7: 14.64, P3_0: 236.8, realPower: 148.9, nphr: 2502.0, notes: 'H-1 pre-wash reading' },
  // WW Event #2 execution point
  { date: '2024-04-05', time: '06:00', T1_7: 74.2, P1_7: 14.65, P3_0: 243.8, realPower: 154.5, nphr: 2432.0, isWaterWashEvent: true, waterWashEventNumber: 2, notes: 'Scheduled off-line compressor water wash' },
  // H+1 after WW Event #2
  { date: '2024-04-06', time: '08:00', T1_7: 74.5, P1_7: 14.65, P3_0: 243.9, realPower: 154.8, nphr: 2430.0, notes: 'H+1 post-wash recovery reading' },

  // Current operational run
  { date: '2024-04-14', time: '08:00', T1_7: 75.0, P1_7: 14.64, P3_0: 243.0, realPower: 154.0, nphr: 2440.0 },
  { date: '2024-04-22', time: '08:00', T1_7: 76.2, P1_7: 14.65, P3_0: 242.0, realPower: 153.2, nphr: 2452.0 },
  { date: '2024-04-30', time: '08:00', T1_7: 77.0, P1_7: 14.63, P3_0: 240.8, realPower: 152.0, nphr: 2468.0 },
  { date: '2024-05-08', time: '08:00', T1_7: 78.4, P1_7: 14.65, P3_0: 239.8, realPower: 151.0, nphr: 2480.0 },
  { date: '2024-05-15', time: '08:00', T1_7: 79.1, P1_7: 14.64, P3_0: 238.5, realPower: 149.8, nphr: 2494.0 },
  { date: '2024-05-22', time: '08:00', T1_7: 79.8, P1_7: 14.63, P3_0: 237.0, realPower: 148.5, nphr: 2506.0 }, // 3-out-of-4 reached
];
