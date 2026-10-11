/**
 * The content rules a report or a moderator's decision refers to (keys of the
 * "reasons" translation namespace). "child" is handled with extra care: the
 * content is blocked for good and the uploader is not warned.
 */
export const REASON_CODES = ["child", "illegal", "sexual", "violence", "hate", "personal", "fraud", "rights", "political", "link", "other"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export function isReasonCode(value: unknown): value is ReasonCode {
  return REASON_CODES.includes(value as ReasonCode);
}
