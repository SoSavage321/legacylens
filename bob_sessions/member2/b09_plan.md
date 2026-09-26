# Plan: Fix 'Bytest' Typo in formatBytes Fallback Label

## Overview

Correct a single-character typo on line 62 of `src/lib/utils.ts`:
`accurateSizes[i] ?? "Bytest"` → `accurateSizes[i] ?? "Bytes"`.

The `formatBytes` function is a pure utility with no DB, auth, or network side
effects. The misspelled branch is only reachable when the caller explicitly
passes `sizeType: "accurate"`, which no current call site does, making this a
zero-runtime-impact fix.

## Blast Radius (observed)

**Changed file:** `src/lib/utils.ts` line 62 only.

**Direct caller:** `src/components/file-uploader.tsx` (lines 238, 239, 291).
All three calls use the default `sizeType = "normal"`, so the `accurateSizes`
fallback path is never reached today.

**Indirect consumers of FileUploader:**
- `src/app/(dashboard)/store/[storeId]/products/new/_components/create-product-form.tsx`
- `src/app/(dashboard)/store/[storeId]/products/[productId]/_components/update-product-form.tsx`

Neither is affected at runtime.

**Not affected:** DB schema, auth, Stripe, Redis, Tailwind config, all other
`src/lib/utils.ts` exports, any route or middleware.

## Sub-Tasks

### 1 — Apply the one-line fix

**Intent:** Correct the typo so the `accurateSizes` fallback emits `"Bytes"`.

**Expected outcome:** Line 62 reads `accurateSizes[i] ?? "Bytes"` with no other
change to the file.

**Steps:**
1. Open `src/lib/utils.ts`.
2. Change `"Bytest"` to `"Bytes"` on line 62.

**Relevant context:** `src/lib/utils.ts` lines 51–65 (full `formatBytes` function).

**Status:** [ ] pending

---

### 2 — Validate

**Intent:** Confirm lint, types, and formatting all pass with the single change.

**Expected outcome:** All three commands exit 0 with no new warnings.

**Steps:**
1. Run `pnpm lint`
2. Run `pnpm typecheck`
3. Run `pnpm format:check`

**Relevant context:** CI config `.github/workflows/code-check.yml` lines 44–48
shows these same three commands run against placeholder `.env` values — no real
secrets are needed.

**Status:** [ ] pending
