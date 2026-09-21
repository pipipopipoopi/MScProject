import { getToken, ApiError } from "./api.js";

const BASE = import.meta.env.VITE_API_BASE || "";

// The export is behind the same token as everything else, so it cannot be a
// plain link: the file is fetched with the header and handed to the browser.
export async function downloadCsv(name = "scroll-tracker.csv") {
  const response = await fetch(BASE + "/api/export.csv", {
    headers: { Authorization: "Bearer " + getToken() },
  });

  if (!response.ok) throw new ApiError("Export failed (" + response.status + ")", response.status);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
