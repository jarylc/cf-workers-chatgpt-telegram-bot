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
}

