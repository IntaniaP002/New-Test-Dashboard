/**
 * Firestore Security Rules — Dirty Dozen Adversarial Verification Spec
 * Mirrors the exact invariants enforced in firestore.rules and security_spec.md.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
  reason: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read/write',
    collection: 'operational_records/rec-1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'request.auth == null fails isAuthenticatedOperator().',
  },
  {
    id: 2,
    name: 'Shadow / ghost field on create',
    collection: 'operational_records/rec-2',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { id: 'rec-2', isAdmin: true },
    reason: 'data.keys().hasOnly([...]) rejects unknown field isAdmin.',
  },
  {
    id: 3,
    name: 'Shadow / ghost field on update',
    collection: 'operational_records/rec-3',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { isWaterWashEvent: true, extraHack: 1 },
    reason: 'affectedKeys().hasOnly(...) rejects unallowlisted keys.',
  },
  {
    id: 4,
    name: 'Path poisoning via invalid document ID',
    collection: 'operational_records/bad.id$123',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'isValidId(recordId) strictly requires ^[a-zA-Z0-9_\\-]+$.',
  },
  {
    id: 5,
    name: 'Client-spoofed createdByUid on create',
    collection: 'operational_records/rec-5',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdByUid: 'spoofed-other-uid' },
    reason: 'incoming().createdByUid == request.auth.uid rejects spoofed UID.',
  },
  {
    id: 6,
    name: 'Mutating immutable createdByUid on update',
    collection: 'operational_records/rec-6',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { createdByUid: 'different-uid' },
    reason: 'incoming().createdByUid == existing().createdByUid prevents tampering.',
  },
  {
    id: 7,
    name: 'Client-spoofed createdAt timestamp',
    collection: 'operational_records/rec-7',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    reason: 'incoming().createdAt == request.time mandates server timestamp.',
  },
  {
    id: 8,
    name: 'Backdating updatedAt on update',
    collection: 'operational_records/rec-8',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { updatedAt: '2020-01-01T00:00:00Z' },
    reason: 'incoming().updatedAt == request.time mandates server timestamp.',
  },
  {
    id: 9,
    name: 'Oversized notes string (> 500 chars)',
    collection: 'operational_records/rec-9',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { notes: 'x'.repeat(501) },
    reason: 'isOptionalString(data, "notes", 500) blocks oversized strings.',
  },
  {
    id: 10,
    name: 'Type poisoning on update',
    collection: 'operational_records/rec-10',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { isWaterWashEvent: 'yes' },
    reason: 'isValidOperationalRecord(incoming()) verifies is bool.',
  },
  {
    id: 11,
    name: 'Writing non-active singleton baseline document',
    collection: 'plant_baselines/hacked',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'configId == "active" strictly confines baseline doc path.',
  },
  {
    id: 12,
    name: 'Unconstrained collection list scraping',
    collection: 'plant_baselines',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    reason: 'allow list: if false on singleton collections; workspaceId checked on operational_records.',
  },
];
