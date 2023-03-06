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
		if (!request.url.endsWith(env.TELEGRAM_BOT_TOKEN)) {
			return new Response(null, {
				status: 401,
			})
		}

		const update: Telegram.Update = await request.json()

		// user is not in whitelist
		const username = update.message?.from.username || update.inline_query?.from.username || update.callback_query?.from.username || ""
		if (env.TELEGRAM_USERNAME_WHITELIST && !env.TELEGRAM_USERNAME_WHITELIST.split(" ").includes(username)) {
			return new Response(null) // no action
		}

		// handle inline query confirmation flow
		if (update.inline_query) {
			if (update.inline_query.query.trim() === "") {
				return new Response(null) // no action
			}
			return Telegram.generateAnswerInlineQueryResponse(update.inline_query?.id, update.inline_query?.query)
		}

		// update is invalid
		if ((!update.message || !update.message.text) && (!update.callback_query)) {
			return new Response(null) // no action
		}
		const query = update.message?.text || update.callback_query?.data
		if (!query) {
			return new Response(null) // no action
		}

		// set temporary processing message if callback query
		if (update.callback_query) {
			await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, query, "(Processing...)")
		}

		// handle messages
		let context: OpenAI.Message[] = []

		if (update.message && update.message.text) {
			// message starts with /start or /chatgpt
			if (query.startsWith("/start") || query.startsWith("/chatgpt")) {
				return Telegram.generateSendMessageResponse(update.message.chat.id, "COMMAND: Hi @"+ update.message.from.username+"! I'm a chatbot powered by OpenAI! Reply your query to this message!",
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
			if (query.startsWith("/clear")) {
				if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
					await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, update.message.chat.id, [])
				}
				return Telegram.generateSendMessageResponse(update.message.chat.id, "COMMAND: Context for the current chat (if it existed) has been cleared.", {
					"reply_markup": {
						"remove_keyboard": true,
					}
				})
			}

			// retrieve current context
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context = await Cloudflare.getKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, update.message.chat.id)
			}

			// add replied to message to context (excluding command replies) if it exists
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
			if (query.startsWith("/context")) {
				if (context.length > 0) {
					return Telegram.generateSendMessageResponse(update.message.chat.id, `COMMAND: ${JSON.stringify(context)}`)
				}
				return Telegram.generateSendMessageResponse(update.message.chat.id, "COMMAND: Context is empty or not available.")
			}
		}

		// prepare context
		context.push({"role": "user", "content": query})

		// query OpenAPI with context
		const response = await OpenAI.complete(env.OPENAI_API_KEY, env.CHATGPT_MODEL, context)
		const json: OpenAI.Response = await response.json()
		const content = json.choices[0].message.content.trim()

		// reply in Telegram if message
		if (update.message) {
			// save reply to context
			if (update.message && env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context.push({"role": "assistant", "content": content})
				await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, update.message.chat.id, context)
			}

			return Telegram.generateSendMessageResponse(update.message.chat.id, json.choices[0].message.content, {
				"reply_to_message_id": update.message.message_id,
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		}

		// edit inline query response message if callback query
		if (update.callback_query) {
			await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, query, content)
			return Telegram.generateAnswerCallbackQueryResponse(update.callback_query.id)
		}

		// other update
		return new Response(null) // no action (should never happen if allowed_updates is set correctly)
	},
}
