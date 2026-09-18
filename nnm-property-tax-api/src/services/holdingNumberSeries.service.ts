import { propertyRepository } from "../repositories/property.repository";
import {
  NEW_HOLDING_NO_DIGITS,
  NEW_HOLDING_NO_PREFIX,
  PARTIALLY_KNOWN_HOLDING_NO_DIGITS,
  PARTIALLY_KNOWN_HOLDING_NO_PREFIX,
  MIGRATED_HOLDING_NO_DIGITS,
  MIGRATED_HOLDING_NO_PREFIX,
  FINALIZED_MIGRATED_HOLDING_NO_DIGITS,
  FINALIZED_MIGRATED_HOLDING_NO_PREFIX,
} from "../constants/taxRates";

async function getNextHoldingNoForSeries(prefix: string, digits: number): Promise<string> {
  const maxNum = await propertyRepository.getMaxHoldingNoUnderPrefix(prefix);
  return prefix + String(maxNum + 1).padStart(digits, "0");
}

export function getNextNewHoldingNo(): Promise<string> {
  return getNextHoldingNoForSeries(NEW_HOLDING_NO_PREFIX, NEW_HOLDING_NO_DIGITS);
}

export function getNextPartiallyKnownHoldingNo(): Promise<string> {
  return getNextHoldingNoForSeries(PARTIALLY_KNOWN_HOLDING_NO_PREFIX, PARTIALLY_KNOWN_HOLDING_NO_DIGITS);
}

export function getNextMigratedHoldingNo(): Promise<string> {
  return getNextHoldingNoForSeries(MIGRATED_HOLDING_NO_PREFIX, MIGRATED_HOLDING_NO_DIGITS);
}

export function getNextFinalizedMigratedHoldingNo(): Promise<string> {
  return getNextHoldingNoForSeries(FINALIZED_MIGRATED_HOLDING_NO_PREFIX, FINALIZED_MIGRATED_HOLDING_NO_DIGITS);
}