export namespace Telegram {
    export interface Update {
        update_id: number
        message: Message
    }

    export interface Message {
        message_id: number
        from: From
        chat: Chat
        date: number
        text: string
        entities: Entity[]
        reply_to_message?: Message
    }

    export interface From {
        id: number
        is_bot: boolean
        first_name: string
        last_name: string
        username: string
        language_code: string
    }

    export interface Chat {
        id: number
        type: string
        first_name?: string
        last_name?: string
        username?: string
        title?: string
        all_members_are_administrators?: boolean
    }

    export interface Entity {
        offset: number
        length: number
        type: string
    }

    export function generateSendMessageResponse(token: string, chat_id: number, text: string, additional_arguments?: { [key: string]: any }): Response {
        return new Response(JSON.stringify({
            "method": "sendMessage",
            "chat_id": chat_id,
            "parse_mode": "Markdown",
            "text": text,
            ...additional_arguments
        }), {
            headers: {
                "content-type": "application/json",
            }
        })
    }
}

