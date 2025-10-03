import { Vercel } from "@vercel/sdk";

export const createVercelClient = (token: string) => {
  return new Vercel({
    bearerToken: token,
  });
};
