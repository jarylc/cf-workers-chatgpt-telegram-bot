# cf-workers-chatgpt-telegram-bot
![Logo](cf-workers-chatgpt-telegram-bot.png)

## Description
![Example](example.png)

Serverless Telegram bot in webhook mode to quickly interface with [OpenAI's Chat Completion API](https://platform.openai.com/docs/guides/chat)

Note: This is mainly for personal use, if you would like to add features, do fork the repository. Do perform PRs back if you would be so kind!

## Prerequisites
- A Cloudflare account with Workers enabled
- The Telegram bot token of a bot created on Telegram via [@BotFather](https://t.me/BotFather)
- An OpenAI API key that has the ability to use the Chat Completion API

## Getting Started
### Wrangler
1. Clone this repository
2. Run `npm ci` or `yarn install`
3. Run `npx wrangler secret put TELEGRAM_BOT_TOKEN` and set the Telegram bot token
4. Run `npx wrangler secret put OPENAI_API_KEY` and set the OpenAI API key
5. Add space-delimited case-sensitive usernames to whitelist in `TELEGRAM_USERNAME_WHITELIST` in wrangler.toml
6. (Optional) To allow extra lines of context, run `npx wrangler kv:namespace create context` and replace the ID of `CHATGPT_TELEGRAM_BOT_KV` and increase `CONTEXT` to more than 0 in wrangler.toml (will consume a lot more tokens)
7. (Optional) To change the model, update `CHATGPT_MODEL` in wrangler.toml to whatever you want as documented at https://platform.openai.com/docs/api-reference/chat/create#chat/create-model
8. Run `npx wrangler publish` to deploy to Cloudflare Workers
9. Replace `{TELEGRAM_BOT_TOKEN}` and `{WORKERS_NAMESPACE}` on the following `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?allowed_updates=%5B%22message%22%5D&url=https%3A%2F%2Fcf-workers-chatgpt-telegram-bot.{WORKERS_NAMESPACE}.workers.dev%2F{TELEGRAM_BOT_TOKEN}` and access it on your browser

## Other Optional Steps
### Commands list (for BotFather as well)
```
start - Start the bot, does nothing otherwise
chatgpt - Triggers use of the bot in group chats without toggling Private Mode
context - Shows stored context for the current chat
clear - Clears the stored context for the current chat and any ForceReply messages
```
