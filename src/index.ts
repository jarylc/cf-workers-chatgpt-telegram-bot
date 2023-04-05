import {OpenAI} from "./openai"
import {Telegram} from "./telegram"
import {Cloudflare} from "./cloudflare"

export enum ServiceType {
    OAI = 1,
    AOAI = 2
}

export interface OAIEnv {
    OAI_API_KEY: string
	OAI_CHATGPT_MODEL: string
}

export interface AOAIEnv {
    AOAI_API_KEY: string
    AOAI_RESOURCE_NAME: string
    AOAI_DEPLOYMENT_NAME: string
    AOAI_API_VERSION: string
}

export interface Env extends OAIEnv, AOAIEnv {
	CHATGPT_TELEGRAM_BOT_KV: KVNamespace
	TELEGRAM_BOT_TOKEN: string
	TELEGRAM_USERNAME_WHITELIST: string
	CHATGPT_BEHAVIOR: string
    SERVICE_TYPE: ServiceType
	CONTEXT: number
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.cf?.asOrganization !== "Telegram Messenger Inc" || !request.url.endsWith(env.TELEGRAM_BOT_TOKEN)) {
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

		if (update.message) {
			// query OpenAPI with context
            const content = await (async () => {
                switch (env.SERVICE_TYPE) {
                    case ServiceType.OAI:
                        return OpenAI.oai_complete(
                            env.OAI_API_KEY, 
                            env.OAI_CHATGPT_MODEL, 
                            env.CHATGPT_BEHAVIOR, 
                            `tg_${username}`, 
                            context)
                    case ServiceType.AOAI:
                        return OpenAI.aoai_complete(
                            env.AOAI_API_KEY, 
                            env.AOAI_RESOURCE_NAME, 
                            env.AOAI_DEPLOYMENT_NAME, 
                            env.AOAI_API_VERSION, 
                            env.CHATGPT_BEHAVIOR, 
                            `tg_${username}`, 
                            context)
                    default:
                        throw new Error("Invalid service type")
                }
            })();

			// save reply to context
			if (update.message && env.CONTEXT && env.CONTEXT > 0 && env.CHATGPT_TELEGRAM_BOT_KV) {
				context.push({"role": "assistant", "content": content})
				await Cloudflare.putKVChatContext(env.CHATGPT_TELEGRAM_BOT_KV, update.message.chat.id, context)
			}

			return Telegram.generateSendMessageResponse(update.message.chat.id, content, {
				"reply_to_message_id": update.message.message_id,
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		} else if (update.callback_query) {
			const callbackQuery = update.callback_query
			ctx.waitUntil(new Promise(async _ => {
				// query OpenAPI with context
                const content = await (async () => {
                    switch (env.SERVICE_TYPE) {
                        case ServiceType.OAI:
                            return OpenAI.oai_complete(
                                env.OAI_API_KEY, 
                                env.OAI_CHATGPT_MODEL, 
                                env.CHATGPT_BEHAVIOR, 
                                `tg_${username}`, 
                                context)
                        case ServiceType.AOAI:
                            return OpenAI.aoai_complete(
                                env.AOAI_API_KEY, 
                                env.AOAI_RESOURCE_NAME, 
                                env.AOAI_DEPLOYMENT_NAME, 
                                env.AOAI_API_VERSION, 
                                env.CHATGPT_BEHAVIOR, 
                                `tg_${username}`, 
                                context)
                        default:
                            throw new Error("Invalid service type")
                    }
                })();

				// edit message with reply
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, callbackQuery.inline_message_id, query, content)
			}))
			return Telegram.generateAnswerCallbackQueryResponse(callbackQuery.id)
		}

		// other update
		return new Response(null) // no action (should never happen if allowed_updates is set correctly)
	},
}
