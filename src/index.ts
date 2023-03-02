import {OpenAI} from "./openai"
import {Telegram} from "./telegram"
import {Cloudflare} from "./cloudflare"

export interface Env {
	CHATGPT_TELEGRAM_BOT_KV: KVNamespace
	TELEGRAM_BOT_TOKEN: string
	TELEGRAM_USERNAME_WHITELIST: string
	OPENAI_API_KEY: string
	CHATGPT_MODEL: string
	CONTEXT: number
}

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		if (request.url.includes(env.TELEGRAM_BOT_TOKEN)) {
			const update: Telegram.Update = await request.json()
			console.log(JSON.stringify(update))

			// update is not a message
			if (!("message" in update) || !("text" in update.message)) {
				return new Response(null) // no action
			}

			// user is not in whitelist
			if (env.TELEGRAM_USERNAME_WHITELIST && !env.TELEGRAM_USERNAME_WHITELIST.split(" ").includes(String(update.message.from.username))) {
				await Telegram.sendMessage(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, "You are not whitelisted!")
				return new Response(null)
			}

			// message starts with /start or /chatgpt
			if (update.message.text.startsWith("/start") || update.message.text.startsWith("/chatgpt")) {
				await Telegram.sendMessage(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, "Hi @"+ update.message.from.username+"! I'm a chatbot powered by OpenAI! Reply your query to this message!",
					{
						"reply_markup": {
							"force_reply": true,
							"input_field_placeholder": "Ask me anything!",
							"selective": true,
						}
					}
				)
				return new Response(null)
			}

			// message starts with /clear
			if (update.message.text.startsWith("/clear")) {
				if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
					await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, String(update.message.chat.id), [])
				}
				await Telegram.sendMessage(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, "Context for the current chat (if it existed) has been cleared.")
				return new Response(null)
			}

			// retrieve context and truncate to a maximum of (env.CONTEXT * 2)
			let context: OpenAI.Message[] = []
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context = await Cloudflare.getKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, String(update.message.chat.id))
			}
			while (context.length > Math.max(1, env.CONTEXT * 2)) {
				context.shift()
			}

			// message starts with /context
			if (update.message.text.startsWith("/context")) {
				await Telegram.sendMessage(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, JSON.stringify(context))
				return new Response(null)
			}

			// prepare context
			context.push({"role": "user", "content": update.message.text})

			// query OpenAPI with context
			const response = await OpenAI.complete(env.OPENAI_API_KEY, env.CHATGPT_MODEL, context)
			const json: OpenAI.Response = await response.json()
			console.log(JSON.stringify(json))

			// reply in Telegram
			const content = json.choices[0].message.content
			await Telegram.sendMessage(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, json.choices[0].message.content)

			// add reply to context
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context.push({"role": "assistant", "content": content})
				await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, String(update.message.chat.id), context)
			}

			return new Response(null)
		} else {
			return new Response(null, {
				status: 401,
			})
		}
	},
}
