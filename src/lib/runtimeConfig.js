const LOCAL_CONFIG_KEY = "tercom-supabase-runtime-config";

function normalizeConfig(rawConfig = {}) {
  return {
    supabaseUrl: String(rawConfig.supabaseUrl || rawConfig.url || "").trim().replace(/\/+$/, ""),
    supabasePublishableKey: String(rawConfig.supabasePublishableKey || rawConfig.publishableKey || rawConfig.key || "").trim()
  };
}

export function hasSupabaseRuntimeConfig(config) {
  return Boolean(config?.supabaseUrl && config?.supabasePublishableKey);
}

export async function loadRuntimeConfig() {
  try {
    const response = await fetch("/.netlify/functions/public-config", {
      cache: "no-store"
    });

    if (response.ok) {
      const payload = await response.json();
      const normalized = normalizeConfig(payload);
      if (hasSupabaseRuntimeConfig(normalized)) {
        return normalized;
      }
    }
  } catch {
    // Ignore and continue to local fallback.
  }

  try {
    const rawLocal = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (rawLocal) {
      const normalized = normalizeConfig(JSON.parse(rawLocal));
      if (hasSupabaseRuntimeConfig(normalized)) {
        return normalized;
      }
    }
  } catch {
    // Ignore malformed local config.
  }

  return normalizeConfig();
}
