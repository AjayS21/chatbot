<script lang="ts">
	import { onMount, tick } from 'svelte';

	type Direction = 'inbound' | 'outbound';

	type UiMessage = {
		id: string;
		direction: Direction | 'system';
		content: string;
		createdAt: string;
	};

	type SendResponse = { reply: string; sessionId: string };
	type HistoryResponse = {
		reply: string;
		sessionId: string;
		messages: Array<{ id: string; direction: Direction; content: string; createdAt: string }>;
	};

	const SESSION_STORAGE_KEY = 'spur.sessionId';
	const MAX_MESSAGE_CHARS = 4000; // Keep aligned with backend validation.
	const ENABLE_TYPING_INDICATOR = true; // Optional UX: can be turned off without affecting chat behavior.

	let messages = $state<UiMessage[]>([]);
	let draft = $state('');
	let sessionId = $state<string | null>(null);

	let isBooting = $state(true);
	let isSending = $state(false);
	let typingIndicator = $state(false);

	let listEl = $state<HTMLDivElement | null>(null);
	let expanded = $state<Record<string, boolean>>({});

	function nowIso(): string {
		return new Date().toISOString();
	}

	function pushSystem(text: string): void {
		messages = [
			...messages,
			{ id: crypto.randomUUID(), direction: 'system', content: text, createdAt: nowIso() }
		];
	}

	function pushAgent(text: string): void {
		messages = [
			...messages,
			{ id: crypto.randomUUID(), direction: 'outbound', content: text, createdAt: nowIso() }
		];
	}

	function errorToFriendlyMessage(errorCode: unknown): string {
		switch (errorCode) {
			case 'backend_unreachable':
				return "Sorry, I'm having trouble right now. Please try again in a moment.";
			case 'db_not_configured':
				return "Sorry, I'm having trouble right now. Please try again in a moment.";
			case 'invalid_session':
			case 'not_found':
				return "Sorry, I'm having trouble right now. Please try again in a moment.";
			case 'empty_message':
				return 'Please type a message before sending.';
			case 'bad_request':
			case 'invalid_json':
				return "Sorry, I'm having trouble right now. Please try again in a moment.";
			default:
				return "Sorry, I'm having trouble right now. Please try again in a moment.";
		}
	}

	function pushAgentError(errorCode: unknown): void {
		// UX requirement: backend/LLM errors should appear as a normal agent message (not an alert/system banner).
		pushAgent(errorToFriendlyMessage(errorCode));
	}

	async function scrollToBottom(): Promise<void> {
		await tick();
		if (!listEl) return;
		listEl.scrollTop = listEl.scrollHeight;
	}

	function upsertSession(id: string): void {
		sessionId = id;
		try {
			localStorage.setItem(SESSION_STORAGE_KEY, id);
		} catch {
			// localStorage can fail in private mode; UX should still work for the current tab.
		}
	}

	async function loadHistory(existingSessionId: string): Promise<void> {
		try {
			const res = await fetch(`/api/chat/${encodeURIComponent(existingSessionId)}`);
			const data = (await res.json()) as Partial<HistoryResponse> & { error?: unknown };

			if (!res.ok) {
				if (res.status === 404) {
					// Session expired or DB reset; clear and start fresh.
					try {
						localStorage.removeItem(SESSION_STORAGE_KEY);
					} catch {
						// ignore
					}
					sessionId = null;
					pushAgentError(data.error);
					return;
				}

				pushAgentError(data.error);
				return;
			}

			if (!data.sessionId || !Array.isArray(data.messages)) {
				pushAgentError('unexpected_response');
				return;
			}

			upsertSession(data.sessionId);
			messages = data.messages.map((m) => ({
				id: m.id,
				direction: m.direction,
				content: m.content,
				createdAt: m.createdAt
			}));
			await scrollToBottom();
		} catch {
			pushAgentError('backend_unreachable');
		}
	}

	async function send(): Promise<void> {
		const trimmed = draft.trim();

		// Handle empty messages gracefully (don't fire requests).
		if (trimmed.length === 0) {
			pushSystem(errorToFriendlyMessage('empty_message'));
			draft = '';
			return;
		}

		// Handle very long messages gracefully: prevent send and inform the user.
		if (trimmed.length > MAX_MESSAGE_CHARS) {
			pushSystem(`Your message is too long (${trimmed.length}/${MAX_MESSAGE_CHARS}). Please shorten it.`);
			return;
		}

		if (isSending) return;

		isSending = true;
		typingIndicator = ENABLE_TYPING_INDICATOR;

		// Optimistic UI: show the user's message immediately.
		const userId = crypto.randomUUID();
		messages = [...messages, { id: userId, direction: 'inbound', content: trimmed, createdAt: nowIso() }];
		draft = '';
		await scrollToBottom();

		try {
			const res = await fetch('/api/chat/message', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: trimmed, ...(sessionId ? { sessionId } : {}) })
			});

			const data = (await res.json()) as Partial<SendResponse> & { error?: unknown };

			if (!res.ok) {
				pushAgentError(data.error);
				await scrollToBottom();
				return;
			}

			if (!data.sessionId || typeof data.reply !== 'string') {
				pushAgentError('unexpected_response');
				await scrollToBottom();
				return;
			}

			upsertSession(data.sessionId);

			// Append assistant reply.
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					direction: 'outbound',
					content: data.reply,
					createdAt: nowIso()
				}
			];
			await scrollToBottom();
		} catch {
			pushAgentError('backend_unreachable');
			await scrollToBottom();
		} finally {
			typingIndicator = false;
			isSending = false;
		}
	}

	function onKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}

	function displayContent(m: UiMessage): { text: string; isTruncated: boolean } {
		const limit = 1000;
		if (m.direction === 'system') return { text: m.content, isTruncated: false };
		if (expanded[m.id]) return { text: m.content, isTruncated: false };
		if (m.content.length <= limit) return { text: m.content, isTruncated: false };
		return { text: `${m.content.slice(0, limit)}…`, isTruncated: true };
	}

	onMount(async () => {
		try {
			const stored = localStorage.getItem(SESSION_STORAGE_KEY);
			if (stored && stored.trim().length > 0) {
				sessionId = stored;
				await loadHistory(stored);
			} else {
				pushSystem('Start a conversation below.');
			}
		} catch {
			pushSystem('Start a conversation below.');
		} finally {
			isBooting = false;
			await scrollToBottom();
		}
	});
</script>

<div class="page">
	<header class="header">
		<div class="title">Live chat</div>
		<div class="subtitle">{sessionId ? `Session: ${sessionId}` : 'New session'}</div>
	</header>

	<div class="chat" aria-busy={isBooting}>
		<div class="messages" bind:this={listEl}>
			{#if isBooting}
				<div class="system">Loading chat…</div>
			{/if}

			{#each messages as m (m.id)}
				<div class="row {m.direction}">
					<div class="bubble {m.direction}">
						<div class="text">{displayContent(m).text}</div>

						{#if displayContent(m).isTruncated}
							<button
								class="more"
								type="button"
								onclick={() => (expanded[m.id] = true)}
								aria-label="Show full message"
							>
								Show more
							</button>
						{/if}
					</div>
				</div>
			{/each}

			{#if ENABLE_TYPING_INDICATOR && typingIndicator}
				<div class="row outbound">
					<div class="bubble outbound typing">Agent is typing…</div>
				</div>
			{/if}
		</div>

		<form
			class="composer"
			onsubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<textarea
				class="input"
				placeholder="Type your message…"
				bind:value={draft}
				onkeydown={onKeyDown}
				disabled={isBooting}
				rows="2"
			></textarea>
			<div class="actions">
				<div class="hint">
					{draft.trim().length}/{MAX_MESSAGE_CHARS}
				</div>
				<button class="send" type="submit" disabled={isBooting || isSending || draft.trim().length === 0}>
					{isSending ? 'Sending…' : 'Send'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 16px;
		font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
	}

	.header {
		margin-bottom: 12px;
	}

	.title {
		font-size: 18px;
		font-weight: 600;
	}

	.subtitle {
		font-size: 12px;
		color: #666;
		word-break: break-all;
	}

	.chat {
		border: 1px solid #ddd;
		border-radius: 8px;
		overflow: hidden;
	}

	.messages {
		height: 60vh;
		min-height: 360px;
		overflow: auto;
		padding: 12px;
		background: #fafafa;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.row {
		display: flex;
	}

	.row.inbound {
		justify-content: flex-end;
	}

	.row.outbound {
		justify-content: flex-start;
	}

	.row.system {
		justify-content: center;
	}

	.bubble {
		max-width: 85%;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid #e5e5e5;
		background: #fff;
	}

	.bubble.inbound {
		background: #e9f3ff;
		border-color: #cfe5ff;
	}

	.bubble.outbound {
		background: #fff;
	}

	.bubble.system {
		background: #f4f4f4;
		border-color: #e6e6e6;
		color: #444;
	}

	.text {
		white-space: pre-wrap;
		word-break: break-word;
		overflow-wrap: anywhere;
		line-height: 1.35;
	}

	.more {
		margin-top: 8px;
		border: none;
		background: transparent;
		padding: 0;
		color: #0a66c2;
		cursor: pointer;
		font-size: 12px;
	}

	.typing {
		font-style: italic;
		color: #555;
	}

	.composer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-top: 1px solid #ddd;
		background: #fff;
	}

	.input {
		width: 100%;
		resize: vertical;
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid #ccc;
		font: inherit;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.hint {
		font-size: 12px;
		color: #666;
	}

	.send {
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid #ccc;
		background: #f8f8f8;
		cursor: pointer;
	}

	.send:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
