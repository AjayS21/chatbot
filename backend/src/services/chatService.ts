/**
 * Backwards-compatible exports.
 *
 * Why:
 * - `routes/chat.ts` (and any future imports) can keep importing from `services/chatService.ts`
 *   while the implementation lives in the more explicit `services/chat/chatService.ts`.
 */
export * from "./chat/chatService.js";


