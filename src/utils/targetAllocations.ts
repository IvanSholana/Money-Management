import { Asset, BudgetPocket, TargetAllocation } from "../types";
import { PocketSummary } from "./pockets";

export function sumTargetAllocations(allocations: TargetAllocation[] | undefined): number {
  return (allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
}

export function allocationValueForTarget(
  allocations: TargetAllocation[] | undefined,
  targetId: string,
  sourceValue: number,
): number {
  const cleanAllocations = (allocations || []).filter((allocation) => allocation.targetId && allocation.amount > 0);
  const requested = cleanAllocations
    .filter((allocation) => allocation.targetId === targetId)
    .reduce((sum, allocation) => sum + allocation.amount, 0);
  const totalRequested = sumTargetAllocations(cleanAllocations);

  if (requested <= 0 || sourceValue <= 0) return 0;
  if (totalRequested <= sourceValue) return requested;

  return Math.round((requested / totalRequested) * sourceValue);
}

export function assetTargetValue(asset: Asset, targetId: string): number {
  if (asset.targetAllocations?.length) {
    return allocationValueForTarget(asset.targetAllocations, targetId, asset.value);
  }

  return asset.targetId === targetId ? asset.value : 0;
}

export function pocketTargetValue(summary: PocketSummary, targetId: string): number {
  const sourceValue = Math.max(0, summary.availableBalance);
  if (summary.pocket.targetAllocations?.length) {
    return allocationValueForTarget(summary.pocket.targetAllocations, targetId, sourceValue);
  }

  return summary.pocket.targetId === targetId ? sourceValue : 0;
}

export function formatAllocationSummary(
  allocations: TargetAllocation[] | undefined,
  targetName: (targetId: string) => string,
  fallbackTargetId?: string,
  fallbackValue?: number,
): string {
  if (allocations?.length) {
    return allocations.map((allocation) => `${targetName(allocation.targetId)} (${allocation.amount})`).join(", ");
  }

  if (fallbackTargetId && fallbackValue) return `${targetName(fallbackTargetId)} (${fallbackValue})`;
  return "Tidak dialokasikan";
}
