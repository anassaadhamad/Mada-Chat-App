/**
 * Stable Zego room id for a DM conversation (shared by both participants).
 */
export function zegoRoomIdFromConversationId(conversationId: string): string {
  return `mada_${conversationId}`;
}
