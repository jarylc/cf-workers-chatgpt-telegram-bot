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

}
