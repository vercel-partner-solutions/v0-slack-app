export default defineNitroConfig({
  srcDir: "server",
  compatibilityDate: "2025-07-27",
  storage: {
    redis: {
      driver: "upstash",
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    },
  },
});
