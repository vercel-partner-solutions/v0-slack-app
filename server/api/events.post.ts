import { createHandler } from "@vercel/bolt";
import { app, receiver } from "../app";

export default defineEventHandler(async (event) => {
	const request = toWebRequest(event);

	const handler = createHandler(app, receiver);

	// This is a workaround to avoid the TypeScript error, this will be fixed in the next version of the package
	const response = new Response(null, {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});

	const result = await handler(request, response);

	return result;
});
