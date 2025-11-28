export async function handleFetch(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 404) {
            console.warn(`Error fetching from [${url}] - likely invalid request, or deleted record`);
        }
        const errorMsg = data?.[0]?.message || response.statusText;
        console.error(`Error ${response.status}: ${errorMsg}`);
        throw new Error(`Error ${response.status}: ${errorMsg}`);
    }

    return data;
}