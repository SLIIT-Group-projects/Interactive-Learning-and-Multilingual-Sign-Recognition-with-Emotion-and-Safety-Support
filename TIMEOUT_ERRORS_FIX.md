# Timeout Errors Fix

## Problem
Multiple API endpoints are timing out, causing `AbortError` errors:

1. **`/api/eh/finalize`** - Timing out at 20 seconds (too short)
2. **`/api/hand/analyze`** - Timing out at 60 seconds (processing is slow)

## Root Causes

### 1. Finalize Endpoint (20s timeout)
- **Issue**: Default timeout was 20 seconds
- **Why it fails**: Finalize needs to process all session data (emotions + hands), compute fusion, calculate behavior, etc.
- **Fix**: ✅ Increased to 60 seconds

### 2. Hand Analysis (60s timeout)
- **Issue**: Processing multiple frames (8-12 frames) takes a long time
- **Why it fails**: 
  - Each frame needs hand detection (MediaPipe + OpenCV)
  - Speed calculation across frames
  - Validation checks
  - With 12 frames, this can exceed 60 seconds
- **Status**: Still timing out even at 60s

## Fixes Applied

### ✅ Fixed: Finalize Timeout
**File**: `frontend/app/story/[id].tsx`
- Changed timeout from 20s (default) to 60s
- Now has enough time to process all session data

### ⚠️ Still Issue: Hand Analysis Timeout
**Current**: 60 seconds
**Problem**: Still timing out with large frame batches

**Possible solutions:**
1. **Increase timeout further** (to 90s or 120s)
2. **Optimize backend** - Process frames in parallel
3. **Reduce frame count** - Send fewer frames per batch
4. **Add progress updates** - Stream results instead of waiting for all

## Current Status

✅ **Finalize endpoint** - Fixed (60s timeout)
⚠️ **Hand analysis** - Still timing out (needs optimization or longer timeout)

## What's Working

From the logs, I can see:
- ✅ Emotion prediction working (line 911-912, 937, 940-941)
- ✅ Some hand analysis succeeding (line 942, 946)
- ✅ Finalize eventually succeeds (line 933)
- ✅ System IS producing outputs (line 934-935 shows final results)

**The system works, but timeouts are causing errors before results arrive.**

## Next Steps

1. ✅ **Finalize timeout** - Already fixed to 60s
2. **Hand analysis timeout** - Consider:
   - Increase to 90-120 seconds
   - Or optimize backend to process faster
   - Or reduce batch size (send fewer frames)

## Test

After restarting Expo, the finalize errors should be reduced. Hand analysis might still timeout if processing many frames.
