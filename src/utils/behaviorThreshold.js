export const BEHAVIOR_THRESHOLD = 6;

export function getBehaviorThresholdCount(count) {
  return (count?.adjusted ?? Math.max(0, (count?.served || 0) - (count?.buybacks || 0)))
    + (count?.pending || 0);
}

export function behaviorThresholdMessage(count) {
  const total = getBehaviorThresholdCount(count);
  const buybacks = count?.buybacks > 0 ? ", after buybacks" : "";
  return `This student's Reteach count is ${total} when we count served Reteaches plus pending Reteaches${buybacks}. Please treat this as a habitual violation of school rules and follow the WVEIS procedures.`;
}

export function behaviorThresholdError(count) {
  const error = new Error(behaviorThresholdMessage(count));
  error.code = "behavior/threshold-reached";
  error.count = count;
  return error;
}
