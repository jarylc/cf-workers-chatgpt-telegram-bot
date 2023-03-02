import {OpenAI} from "./openai";
import {Telegram} from "./telegram";

export interface Env {
	CHATGPT_TELEGRAM_BOT_KV: KVNamespace;
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_USERNAME_WHITELIST: string;
	OPENAI_API_KEY: string;
	CHATGPT_MODEL: string;
	CONTEXT: number;
}

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		if (request.url.includes(env.TELEGRAM_BOT_TOKEN)) {
			const update: Telegram.Update = await request.json();
			console.log(JSON.stringify(update))

			// update is not a message
			if (!("message" in update) || !("text" in update.message)) {
				return new Response(null); // no action
			}

			// user is not in whitelist
			if (env.TELEGRAM_USERNAME_WHITELIST && !env.TELEGRAM_USERNAME_WHITELIST.split(" ").includes(String(update.message.from.username))) {
				await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						"chat_id": update.message.chat.id,
						"text": "You are not whitelisted!",
					})
				});
				return new Response(null);
			}

			// message starts with /start or /chatgpt
			if (update.message.text.startsWith("/start") || update.message.text.startsWith("/chatgpt")) {
				await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						"chat_id": update.message.chat.id,
						"parse_mode": "Markdown",
						"reply_markup": {
							"force_reply": true,
							"input_field_placeholder": "Ask me anything!",
							"selective": true,
						},
						"text": "Hi @"+ update.message.from.username+"! I'm a chatbot powered by OpenAI! Reply your query to this message!",
					})
				});
				return new Response(null);
			}

			// process context
			let context: any = null
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context = await env.CHATGPT_TELEGRAM_BOT_KV.get(String(update.message.chat.id))
				if (context != null) {
					context = JSON.parse(context)
				}
			}
			if (context == null) {
				context = []
			}

			// message starts with /context
			if (update.message.text.startsWith("/context")) {
				await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						"chat_id": update.message.chat.id,
						"parse_mode": "Markdown",
						"text": JSON.stringify(context),
					})
				});
				return new Response(null);
			}

			// prepare context
			context.push({"role": "user", "content": update.message.text})
			while (context.length > Math.max(1, env.CONTEXT*2)) {
				context.shift();
			}

			// query OpenAPI with context
			const response = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": "Bearer " + env.OPENAI_API_KEY,
				},
				body: JSON.stringify({
					"model": env.CHATGPT_MODEL ? env.CHATGPT_MODEL : "gpt-3.5-turbo",
					"messages": context
				})
			})
			const json: OpenAI.Response = await response.json();
			console.log(JSON.stringify(json))
			const content = json.choices[0].message.content

			// reply in Telegram
			await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					"chat_id": update.message.chat.id,
					"parse_mode": "Markdown",
					"text": content
				})
			});

			// update context
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context.push({"role": "assistant", "content": content})
				await env.CHATGPT_TELEGRAM_BOT_KV.put(String(update.message.chat.id), JSON.stringify(context))
			}

			return new Response(null);
		} else {
			return new Response(null, {
				status: 401,
			});
		}
	},
};
