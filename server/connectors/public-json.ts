/** Preserve integer IDs outside IEEE-754 precision before JSON.parse can round them.
 * Quoted text is copied unchanged. Non-integer numeric values retain normal JSON semantics. */
export function parsePublicJson(raw: string): unknown {
    let converted = "", quoted = false, escaped = false;
    for (let index = 0; index < raw.length; index++) {
        const char = raw[index];
        if (quoted) {
            converted += char;
            if (escaped)
                escaped = false;
            else if (char === "\\")
                escaped = true;
            else if (char === '"')
                quoted = false;
            continue;
        }
        if (char === '"') {
            quoted = true;
            converted += char;
            continue;
        }
        if (char === "-" || /\d/.test(char)) {
            let end = index + 1;
            while (end < raw.length && /[\d.eE+\-]/.test(raw[end]))
                end++;
            const token = raw.slice(index, end);
            if (/^-?(?:0|[1-9]\d*)$/.test(token) && token.length > 15) {
                if (token.length > 128)
                    throw new Error("Numeric field exceeds protocol bounds.");
                const number = BigInt(token);
                converted += number > BigInt(Number.MAX_SAFE_INTEGER) || number < BigInt(Number.MIN_SAFE_INTEGER) ? JSON.stringify(token) : token;
            }
            else
                converted += token;
            index = end - 1;
        }
        else
            converted += char;
    }
    return JSON.parse(converted);
}
export async function boundedPublicBody(response: Response, maxBytes: number): Promise<string> {
    const size = Number(response.headers.get("content-length"));
    if (Number.isFinite(size) && size > maxBytes)
        throw new Error("Provider body exceeds protocol limit.");
    if (!response.body)
        throw new Error("Provider body is empty.");
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const item = await reader.read();
            if (item.done)
                break;
            bytes += item.value.byteLength;
            if (bytes > maxBytes) {
                await reader.cancel();
                throw new Error("Provider body exceeds protocol limit.");
            }
            chunks.push(item.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
}
