/**
 * Peer read cursor vs message time. Uses strict `>` so a read timestamp equal to
 * `createdAt` (same-ms races) still counts as delivered, not read.
 */
export function messageCreatedAtMs(createdAt: number | string | undefined): number {
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
  if (typeof createdAt === "string") {
    const n = Date.parse(createdAt);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function isReadByPeer(
  messageCreatedAt: number | string | undefined,
  peerReadAt: number | undefined
): boolean {
  const msgMs = messageCreatedAtMs(messageCreatedAt);
  if (msgMs <= 0) return false;
  if (peerReadAt == null || !Number.isFinite(peerReadAt) || peerReadAt <= 0) return false;
  return peerReadAt > msgMs;
}
