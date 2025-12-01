import axios from 'axios';
export default async function ({ sessionKey }) {
    const authUrl = new URL("https://auth.3b4sf.com/getToken");
    authUrl.searchParams.set("sessionKey", sessionKey);
    const auth = await axios.get(
        authUrl.toString()
    ).then(response => {
        return response?.data?.responseObject;
    }).catch(err => {
        throw new Error(`Failed to authorize request: ${err?.response?.data?.message ?? err.message}`)
    });
    return auth;
}