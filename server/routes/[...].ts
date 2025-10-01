export default defineEventHandler(async (event) => {
  sendRedirect(event, "https://v0.app", 302);
});
