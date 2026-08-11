import OpenAI from "openai";

function resolveApiKey() {
  return (
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  );
}

function resolveBaseUrl() {
  return (
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1"
  );
}

let _client: OpenAI | null = null;
let _boundKey = "";
let _boundBase = "";

function getClient(): OpenAI {
  const apiKey = resolveApiKey();
  const baseURL = resolveBaseUrl();
  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY (or OPENAI_API_KEY) must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }
  if (!_client || _boundKey !== apiKey || _boundBase !== baseURL) {
    _client = new OpenAI({ apiKey, baseURL });
    _boundKey = apiKey;
    _boundBase = baseURL;
  }
  return _client;
}

/** Lazy OpenAI client — reads env at call time so .env loaded after process start still works. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
