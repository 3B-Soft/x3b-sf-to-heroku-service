import axios from 'axios';

type AuthorizeParams = {
    sessionKey: string;
};

type AuthResponse = {
    sessionId: string;
    instanceUrl: string;
    expiresIn?: number;
};

export default async function ({ sessionKey }: AuthorizeParams): Promise<AuthResponse> {
  const authStart = new Date().getTime();
  const authUrl = new URL("https://auth.3b4sf.com/getToken");
  authUrl.searchParams.set("sessionKey", sessionKey);
  try {
      const response = await axios.get(authUrl.toString());
      console.info(`✅ Authorized successfully in ${new Date().getTime() - authStart}ms`);
      return response?.data?.responseObject;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new Error(`Failed to authorize request: ${err?.response?.data?.message ?? err.message}`);
    }
    throw new Error(`Failed to authorize request: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}