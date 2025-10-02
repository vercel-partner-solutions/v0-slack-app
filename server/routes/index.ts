export default defineEventHandler((event) => {
  if (event.method === "GET") {
    return sendRedirect(event, "https://v0.app", 302);
  }
  throw createError({
    statusCode: 404,
    statusMessage: "Not Found",
  });
});
