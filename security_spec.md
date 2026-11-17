# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Authentication Gate**: Every read and write requires an active Firebase Auth session (`request.auth != null`), supporting both silent Anonymous operator sessions (`sign_in_provider == 'anonymous'`) for frictionless multi-device sync and verified email users (`email_verified == true`). Unauthenticated requests are unconditionally denied.
2. **Workspace Scoping**: All shared operational documents belong strictly to `workspaceId == 'gt-ww-plant-main'`. List queries are constrained to `resource.data.workspaceId == 'gt-ww-plant-main'`.
3. **Path Variable Hardening**: Every single-document target (`get`, `create`, `update`, `delete`) validates `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, length `<= 128`). Singleton config docs (`plant_baselines`, `plant_thresholds`) strictly permit only `configId == 'active'` and deny `list` queries.
4. **Strict Keys & No Ghost Fields**: Every create validates exact required keys (`hasAll`) and allowlisted keys (`hasOnly`). Every update enforces explicit action-based `affectedKeys().hasOnly(...)` allowlists alongside full `isValid[Entity](incoming())` validation.
5. **Identity & Temporal Integrity**:
   - `createdByUid == request.auth.uid` on create and immutable on update (`incoming().createdByUid == existing().createdByUid`).
   - `updatedByUid == request.auth.uid` on create and update.
   - `createdAt == request.time` on create and immutable on update (`incoming().createdAt == existing().createdAt`).
   - `updatedAt == request.time` on create and update.
6. **Zero PII**: No emails, phone numbers, or personal profiles are stored in Firestore collections.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unauthenticated read/write**: `request.auth == null` -> `PERMISSION_DENIED`.
2. **Shadow / Ghost field on create**: `{ ..., isAdmin: true }` in `operational_records` -> `PERMISSION_DENIED` (`hasOnly` rejects unknown key).
3. **Shadow / Ghost field on update**: Update `isWaterWashEvent` plus `extraHack: 1` -> `PERMISSION_DENIED` (`affectedKeys().hasOnly` rejects).
4. **Malicious Document ID (Path Poisoning)**: `recordId = "../../etc/passwd"` or 500-char ID -> `PERMISSION_DENIED` (`isValidId` rejects).
5. **Client-spoofed `createdByUid`**: `createdByUid != request.auth.uid` on create -> `PERMISSION_DENIED`.
6. **Mutating `createdByUid` on update**: Changing `createdByUid` on existing doc -> `PERMISSION_DENIED`.
7. **Client-spoofed timestamp**: `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
8. **Backdating `updatedAt`**: `updatedAt != request.time` on update -> `PERMISSION_DENIED`.
9. **Oversized string / DoW payload**: `notes` with 5000 chars (`> 500`) -> `PERMISSION_DENIED`.
10. **Type poisoning on update**: Updating `isWaterWashEvent` to string `"yes"` instead of `bool` -> `PERMISSION_DENIED` (`isValidOperationalRecord` rejects).
11. **Invalid config doc ID**: Writing to `/plant_baselines/hacked` instead of `'active'` -> `PERMISSION_DENIED`.
12. **Cross-workspace or blind `list` scraping**: Querying `operational_records` without `workspaceId == 'gt-ww-plant-main'` or reading `plant_baselines` list -> `PERMISSION_DENIED`.
