export async function parseJsonResponse(response) {
    const responseText = await response.text();
    let payload;
    try {
        payload = JSON.parse(responseText);
    } catch (error) {
        throw new Error(`${responseErrorText(response, responseText)}; invalid JSON: ${error.message}`);
    }
    if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
}

export function responseErrorText(response, responseText) {
    return `HTTP ${response.status}: ${responseText}`;
}

export function requestHeaders(token, contentType = 'application/json') {
    const headers = { 'Content-Type': contentType };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

export function parseSseProgress(text) {
    const dataLine = text.split(/\r?\n/).find(line => line.startsWith('data: '));
    assertCondition(Boolean(dataLine), 'SSE progress response must include a data line');
    try {
        return JSON.parse(dataLine.slice('data: '.length));
    } catch (error) {
        throw new Error(`SSE progress response must include valid JSON data: ${error.message}`);
    }
}

function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
