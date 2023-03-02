import {OpenAI} from "./openai"

export namespace Cloudflare {
    export async function getKVChatContext(kv: KVNamespace, chat_id: string): Promise<OpenAI.Message[]> {
        const raw_context_from_kv = await kv.get(String(chat_id))
        if (raw_context_from_kv != null) {
            return JSON.parse(raw_context_from_kv)
        }
        return []
    }

    export async function putKVChatContext(kv: KVNamespace, chat_id: string, context: OpenAI.Message[]) {
        await kv.put(chat_id, JSON.stringify(context))
    }
}
