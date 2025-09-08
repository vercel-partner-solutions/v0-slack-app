import { generateObject } from "ai";
import { z } from "zod";
import type { SlackUIMessage } from "../slack/utils";

enum Routes {
    General = "general",
    Model = "model",
    Agent = "agent",
}

export async function routeSlackEvent(
    messages: SlackUIMessage[],
) {
    return await generateObject({
        model: 'openai/gpt-4o-mini',
        schema: z.object({
            route: z.enum(Routes),
            confidence: z.number().min(0).max(100).describe("The confidence in the route"),
            reasoning: z.string().describe("The reasoning for the route"),
        }),
        system: `Classify the query type and complexity based on the messages.

        General: The user is asking a general question, similar to what you would use Google for. For example, "Why is the sky blue?".
        Model: The user is asking a question that is specific to web technology. For example, "What is React?".
        Agent: The user is asking to create, read, update or delete something with the v0 agent. For example, "Create a web app that generates images".
        `,
        messages,
    });
}
