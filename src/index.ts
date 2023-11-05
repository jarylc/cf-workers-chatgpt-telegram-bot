import {OpenAI} from "./openai"
import {Telegram} from "./telegram"
import {Cloudflare} from "./cloudflare"

export interface Env {
	CHATGPT_TELEGRAM_BOT_KV: KVNamespace
	TELEGRAM_BOT_TOKEN: string
	TELEGRAM_USERNAME_WHITELIST: string
	OPENAI_API_KEY: string
	CHATGPT_MODEL: string
	CHATGPT_BEHAVIOR: string
	CONTEXT: number
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (!request.cf?.asOrganization.toLowerCase().includes("telegram") || !request.url.endsWith(env.TELEGRAM_BOT_TOKEN)) {
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
				return Telegram.generateAnswerInlineQueryResponseEmpty(update.inline_query?.id)
			}
			return Telegram.generateAnswerInlineQueryResponse(update.inline_query?.id, update.inline_query?.query)
		}

		// update is invalid
		if ((!update.message || !update.message.text) && (!update.callback_query)) {
			return new Response(null) // no action
		}
		const chatID = update.message?.chat.id || update.callback_query?.chat_instance || null
		if (chatID == null) {
			return new Response(null) // no action
		}
		const query = update.message?.text || update.callback_query?.data
		if (!query) {
			return new Response(null) // no action
		}

		// set temporary processing message if callback query
		if (update.callback_query) {
			await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, `Query: ${query}\n\n(Processing...)`)
		}

		// handle messages
		let context: OpenAI.Message[] = []

		// retrieve current context
		if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
			context = await Cloudflare.getKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, chatID)
		}

		// handle commands
		if (update.message && update.message.text) {
			// message starts with /start or /chatgpt
			if (query.startsWith("/start") || query.startsWith("/chatgpt")) {
				return Telegram.generateSendMessageResponse(chatID, "COMMAND: Hi @"+ update.message.from.username+"! I'm a chatbot powered by OpenAI! Reply your query to this message!",
					{
						"reply_markup": {
							"force_reply": true,
							"input_field_placeholder": "Ask me anything!",
							"selective": true,
						}
					}
				)
			}

			// add replied to message to context (excluding command replies) if it exists
			if (update.message.reply_to_message) {
				if (!update.message.reply_to_message.text.startsWith("COMMAND:")) {
					context.push({"role": (update.message.reply_to_message.from.is_bot ? "assistant" : "user"), "content": update.message.reply_to_message.text})
				}
			}
		}
		// message starts with /clear
		if (query.startsWith("/clear")) {
			if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, chatID, [])
			}
			const content = "COMMAND: Context for the current chat (if it existed) has been cleared."
			if (update.callback_query) {
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, content)
				return Telegram.generateAnswerCallbackQueryResponse(update.callback_query.id, content)
			}
			return Telegram.generateSendMessageResponse(chatID, content, {
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		}
		// message starts with /context
		if (query.startsWith("/context")) {
			const content = context.length > 0 ? `COMMAND: ${JSON.stringify(context)}` : "COMMAND: Context is empty or not available."
			if (update.callback_query) {
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, content)
				return Telegram.generateAnswerCallbackQueryResponse(update.callback_query.id, content)
			}
			return Telegram.generateSendMessageResponse(chatID, content)
		}

		// truncate context to a maximum of (env.CONTEXT * 2)
		while (context.length > Math.max(1, env.CONTEXT * 2)) {
			context.shift()
		}

		// prepare context
		context.push({"role": "user", "content": query})

		if (update.message) {
			// query OpenAPI with context
			const content = await complete(env, chatID, username, context)

			return Telegram.generateSendMessageResponse(chatID, content, {
				"reply_to_message_id": update.message.message_id,
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		} else if (update.callback_query) {
			const callbackQuery = update.callback_query
			ctx.waitUntil(new Promise(async _ => {
				// query OpenAPI with context
				const content = await complete(env, chatID, username, context)

				// edit message with reply
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, callbackQuery.inline_message_id, `Query: ${query}\n\nAnswer:\n${Telegram.sanitize(content)}`)
			}))
			return Telegram.generateAnswerCallbackQueryResponse(callbackQuery.id, "ChatGPT is processing...")
		}

		// other update
		return new Response(null) // no action (should never happen if allowed_updates is set correctly)
	},
}


async function complete(env: Env, chatID: string, username: string, context: OpenAI.Message[]) {
	const content = await OpenAI.complete(env.OPENAI_API_KEY, env.CHATGPT_MODEL, env.CHATGPT_BEHAVIOR, `tg_${username}`, context)

	// save reply to context
	if (env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
		context.push({"role": "assistant", "content": content})
		await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, chatID, context)
	}

	return content
}
