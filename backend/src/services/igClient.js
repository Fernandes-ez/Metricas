const IG_BASE_URL = "https://graph.instagram.com/v26.0";

async function igGet(path, params = {}, token) {
  const url = new URL(`${IG_BASE_URL}/${path}`);
  Object.keys(params).forEach((key) =>
    url.searchParams.append(key, params[key]),
  );
  url.searchParams.append("access_token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || "Instagram API Error");
    error.code = data.error?.code;
    error.subcode = data.error?.error_subcode;
    error.type = data.error?.type;
    error.status = response.status;
    console.error(`IG API Error: [${error.code}] ${error.message}`);
    throw error;
  }

  return data;
}

module.exports = { igGet };
