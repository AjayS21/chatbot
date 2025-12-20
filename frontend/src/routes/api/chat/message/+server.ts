import { env } from "$env/dynamic/private";
import { json, type RequestHandler } from "@sveltejs/kit";

type UpstreamSendMessageBody = {
	message: string;
	sessionId?: string;
};

/**
 * Server-side proxy to the backend API.
 *
 * Why:
 * - Avoids CORS issues in the browser.
 * - Keeps backend URL and auth concerns server-side (extensible later).
 */
export const POST: RequestHandler = async ({ request, fetch }) => {
	let body: UpstreamSendMessageBody;
	try {
		body = (await request.json()) as UpstreamSendMessageBody;
	} catch {
		return json({ error: "invalid_json" }, { status: 400 });
	}

	// Basic guardrails even though the backend validates too.
	if (typeof body.message !== "string" || body.message.trim().length === 0) {
		return json({ error: "empty_message" }, { status: 400 });
	}

	const backendBaseUrl = env.BACKEND_URL ?? "http://localhost:3001";

	try {
		const upstream = await fetch(`${backendBaseUrl}/chat/message`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body)
		});

		const text = await upstream.text();
		let data: unknown = undefined;
		try {
			data = text ? JSON.parse(text) : undefined;
		} catch {
			// If upstream returns non-JSON, still forward a sane response.
			data = { error: "upstream_invalid_json" };
		}

		return json(data, { status: upstream.status });
	} catch {
		return json({ error: "backend_unreachable" }, { status: 502 });
	}
};


