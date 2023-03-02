import {OpenAI} from "./openai"

export namespace Cloudflare {
    export async function getKVChatContext(kv: KVNamespace, chat_id: string): Promise<OpenAI.Message[]> {
        return await kv.get(chat_id, { type: "json" }) || []
    }

    export async function putKVChatContext(kv: KVNamespace, chat_id: string, context: OpenAI.Message[]) {
        await kv.put(chat_id, JSON.stringify(context).replaceAll("\\n", ""))
    }
}
