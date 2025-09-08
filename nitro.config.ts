export default defineNitroConfig({
  srcDir: "server",
  compatibilityDate: "2025-07-27",
  storage: {
    redis: {
      driver: "redis",
      url: process.env.REDIS_URL,
    },
  },
});
