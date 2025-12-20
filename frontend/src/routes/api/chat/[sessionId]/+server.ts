import { env } from "$env/dynamic/private";
import { json, type RequestHandler } from "@sveltejs/kit";

/**
 * Proxies chat history fetch.
 */
export const GET: RequestHandler = async ({ params, fetch }) => {
	const sessionId = params.sessionId;
	if (!sessionId || sessionId.trim().length === 0) {
		return json({ error: "invalid_session" }, { status: 400 });
	}

	const backendBaseUrl = env.BACKEND_URL ?? "http://localhost:3001";

	try {
		const upstream = await fetch(`${backendBaseUrl}/chat/${encodeURIComponent(sessionId)}`, {
			method: "GET"
		});

		const text = await upstream.text();
		let data: unknown = undefined;
		try {
			data = text ? JSON.parse(text) : undefined;
		} catch {
			data = { error: "upstream_invalid_json" };
		}

		return json(data, { status: upstream.status });
	} catch {
		return json({ error: "backend_unreachable" }, { status: 502 });
	}
};


