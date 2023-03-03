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
		if (!request.url.includes(env.TELEGRAM_BOT_TOKEN)) {
			return new Response(null, {
				status: 401,
			})
		}

		const update: Telegram.Update = await request.json()

		// update is not a message
		if (!("message" in update) || !("text" in update.message)) {
			return new Response(null) // no action
		}

		// user is not in whitelist
		if (env.TELEGRAM_USERNAME_WHITELIST && !env.TELEGRAM_USERNAME_WHITELIST.split(" ").includes(String(update.message.from.username))) {
			return new Response(null) // no action
		}

		// message starts with /start or /chatgpt
		if (update.message.text.startsWith("/start") || update.message.text.startsWith("/chatgpt")) {
			return Telegram.generateSendMessageResponse(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, "COMMAND: Hi @"+ update.message.from.username+"! I'm a chatbot powered by OpenAI! Reply your query to this message!",
				{
					"reply_markup": {
						"force_reply": true,
						"input_field_placeholder": "Ask me anything!",
						"selective": true,
					}
				}
			)
		}

		// message starts with /clear
		if (update.message.text.startsWith("/clear")) {
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, String(update.message.chat.id), [])
			}
			return Telegram.generateSendMessageResponse(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, "COMMAND: Context for the current chat (if it existed) has been cleared.", {
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		}

		// retrieve current context
		let context: OpenAI.Message[] = []
		if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
			context = await Cloudflare.getKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, String(update.message.chat.id))
		}

		// add replied to message to context (excluding command replies)
		if (update.message.reply_to_message) {
			if (!update.message.reply_to_message.text.startsWith("COMMAND:")) {
				context.push({"role": (update.message.reply_to_message.from.is_bot ? "assistant" : "user"), "content": update.message.reply_to_message.text})
			}
		}

		// truncate context to a maximum of (env.CONTEXT * 2)
		while (context.length > Math.max(1, env.CONTEXT * 2)) {
			context.shift()
		}

		// message starts with /context
		if (update.message.text.startsWith("/context")) {
			if (context.length > 0) {
				return Telegram.generateSendMessageResponse(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, JSON.stringify(context))
			}
			return Telegram.generateSendMessageResponse(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, "COMMAND: Context is empty or not available.")
		}

		// prepare context
		context.push({"role": "user", "content": update.message.text})

		// query OpenAPI with context
		const response = await OpenAI.complete(env.OPENAI_API_KEY, env.CHATGPT_MODEL, context)
		const json: OpenAI.Response = await response.json()
		const content = json.choices[0].message.content

		// add reply to context
		if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
			context.push({"role": "assistant", "content": content})
			await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, String(update.message.chat.id), context)
		}

		// reply in Telegram
		return Telegram.generateSendMessageResponse(env.TELEGRAM_BOT_TOKEN, update.message.chat.id, json.choices[0].message.content, {
			"reply_to_message_id": update.message.message_id,
			"reply_markup": {
				"remove_keyboard": true,
			}
		})
	},
}
