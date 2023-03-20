export namespace OpenAI {
    export interface Response {
        id:      string;
        object:  string;
        created: number;
        model:   string;
        usage:   Usage;
        choices: Choice[];
    }

    export interface Choice {
        message:       Message;
        finish_reason: string;
        index:         number;
    }

    export interface Message {
        role:    string;
        content: string;
    }

    export interface Usage {
        prompt_tokens:     number;
        completion_tokens: number;
        total_tokens:      number;
    }

    export async function complete(api_key: string, model: string, system: string, user: string, context: Message[]) {
        if (system.trim() != "")
            context.unshift({role: "system", content: system})

        const userHash = Array.from(
            new Uint8Array(
                await crypto.subtle.digest({name: 'SHA-256'}, new TextEncoder().encode(user))
            )
        ).map((b) => b.toString(16).padStart(2, "0")).join("")

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + api_key,
            },
            body: JSON.stringify({
                "model": model ? model : "gpt-3.5-turbo",
                "user": userHash,
                "messages": context
            })
        })
        const json: OpenAI.Response = await response.json()
        return json.choices[0].message.content.trim()
    }
}
