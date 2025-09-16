import {
    CodeChallengeMethod,
    generateCodeVerifier,
    generateState,
    OAuth2Client,
} from "arctic";

const VERCEL_CLIENT_ID = process.env.VERCEL_CLIENT_ID;
const VERCEL_CLIENT_SECRET = process.env.VERCEL_CLIENT_SECRET;
const COOKIE_MAX_AGE = 60 * 10; // 10 minutes
// I can't get the email, profile scopes to work
const SCOPE = ['openid'];
const REDIRECT_PATH = '/auth/callback/vercel';
const AUTHORIZE_PATH = 'https://vercel.com/oauth/authorize';

export default defineEventHandler(async (event): Promise<void> => {
    const eventUrl = getRequestURL(event)
    const { protocol, host } = eventUrl;
    const redirectUrl = new URL(REDIRECT_PATH, `${protocol}//${host}`).toString();

    if (!VERCEL_CLIENT_ID || !VERCEL_CLIENT_SECRET) {
        return sendError(event, createError({ statusCode: 500, statusMessage: "Missing Vercel OAuth credentials" }));
    }

    const client = new OAuth2Client(
        VERCEL_CLIENT_ID,
        VERCEL_CLIENT_SECRET,
        redirectUrl,
    );

    const state = generateState();
    const verifier = generateCodeVerifier();
    const url = client.createAuthorizationURLWithPKCE(
        AUTHORIZE_PATH,
        state,
        CodeChallengeMethod.S256,
        verifier,
        SCOPE,
    );

    const query = getQuery(event)
    const next = query.next as string | undefined

    const redirectTo = next?.startsWith('/')
        ? next
        : '/'

    const cookieOptions = {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: COOKIE_MAX_AGE,
        sameSite: 'lax' as const,
    };

    setCookie(event, 'vercel_oauth_redirect_to', redirectTo, cookieOptions);
    setCookie(event, 'vercel_oauth_state', state, cookieOptions);
    setCookie(event, 'vercel_oauth_code_verifier', verifier, cookieOptions);

    return sendRedirect(event, url.toString(), 302);
});
