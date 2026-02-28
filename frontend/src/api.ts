const API_BASE = '';

export async function api(path: string, body?: object): Promise<{ ok: boolean; json: any }> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { detail: res.statusText || 'Request failed' };
  }
  return { ok: res.ok, json };
}

export async function getApi(path: string): Promise<{ ok: boolean; json: any }> {
  const res = await fetch(API_BASE + path);
  let json: any;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { ok: res.ok, json };
}
