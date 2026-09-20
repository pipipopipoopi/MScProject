// Single place where the dashboard talks to the API.
// The password typed on the sign-in screen is the API token: it is kept in the
// browser so the app does not ask for it again, and sent with every request.

const BASE = import.meta.env.VITE_API_BASE || "";
const STORAGE_KEY = "dm_token";

export function getToken() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiGet(path, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: "Bearer " + getToken() },
    });
  } catch {
    // Network failure, wrong address, or a blocked cross-origin request.
    throw new ApiError("Cannot reach the server", 0);
  }

  if (response.status === 401) throw new ApiError("Wrong password", 401);
  if (!response.ok) throw new ApiError("Request failed (" + response.status + ")", response.status);
  return response.json();
}

// Used by the sign-in screen: a request that only succeeds with a valid token.
export async function verifyToken(token) {
  const previous = getToken();
  setToken(token);
  try {
    await apiGet("/api/summary", { days: 1 });
    return true;
  } catch (error) {
    if (previous) setToken(previous);
    else clearToken();
    throw error;
  }
}
