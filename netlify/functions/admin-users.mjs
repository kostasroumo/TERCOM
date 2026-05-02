const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const ALLOWED_ROLES = new Set(["admin", "partner"]);

function json(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

function getRequiredEnv(name) {
  const value = process.env[name] || "";
  if (!value) {
    throw new Error(`Λείπει η μεταβλητή περιβάλλοντος ${name}.`);
  }

  return value;
}

function getBearerToken(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

function sanitizeText(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeEmail(value) {
  return sanitizeText(value, 320).toLowerCase();
}

function sanitizeRole(value) {
  const role = sanitizeText(value, 32).toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error("Ο ρόλος χρήστη δεν είναι έγκυρος.");
  }

  return role;
}

function sanitizeBoolean(value) {
  return value === true || value === "true";
}

function defaultTitleForRole(role) {
  return role === "admin" ? "Administrator" : "Field Partner";
}

function mapProfileRow(row = {}) {
  return {
    id: row.id || "",
    email: row.email || "",
    role: row.role || "partner",
    displayName: row.display_name || "",
    companyName: row.company_name || "",
    title: row.title || "",
    isActive: row.is_active !== false,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

async function parseJsonBody(event) {
  if (!event.body) {
    return {};
  }

  if (typeof event.body === "string") {
    return JSON.parse(event.body || "{}");
  }

  return event.body;
}

async function callJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function serviceHeaders(extraHeaders = {}) {
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders
  };
}

async function assertCallerIsAdmin(event) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const publishableKey = getRequiredEnv("SUPABASE_PUBLISHABLE_KEY");
  const accessToken = getBearerToken(event.headers);

  if (!accessToken) {
    throw Object.assign(new Error("Δεν βρέθηκε έγκυρο session για τη διαχείριση χρηστών."), { statusCode: 401 });
  }

  const { response: userResponse, payload: authUser } = await callJson(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok || !authUser?.id) {
    throw Object.assign(new Error("Η σύνδεση έληξε ή δεν είναι έγκυρη."), { statusCode: 401 });
  }

  const profile = await fetchProfileById(authUser.id);
  if (!profile || profile.role !== "admin" || profile.isActive === false) {
    throw Object.assign(new Error("Η διαχείριση χρηστών είναι διαθέσιμη μόνο σε ενεργό admin."), { statusCode: 403 });
  }

  return { authUser, profile };
}

async function fetchProfileById(profileId) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const query = new URLSearchParams({
    select: "id,email,role,display_name,company_name,title,is_active,created_at,updated_at",
    id: `eq.${profileId}`,
    limit: "1"
  });

  const { response, payload } = await callJson(`${supabaseUrl}/rest/v1/profiles?${query.toString()}`, {
    method: "GET",
    headers: serviceHeaders({
      accept: "application/json"
    })
  });

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Απέτυχε η ανάκτηση του profile.");
  }

  return Array.isArray(payload) && payload.length ? mapProfileRow(payload[0]) : null;
}

async function listProfiles() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const query = new URLSearchParams({
    select: "id,email,role,display_name,company_name,title,is_active,created_at,updated_at",
    order: "is_active.desc,display_name.asc,email.asc"
  });

  const { response, payload } = await callJson(`${supabaseUrl}/rest/v1/profiles?${query.toString()}`, {
    method: "GET",
    headers: serviceHeaders({
      accept: "application/json"
    })
  });

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Απέτυχε η φόρτωση των χρηστών.");
  }

  return Array.isArray(payload) ? payload.map(mapProfileRow) : [];
}

async function upsertProfile(profileInput) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const query = new URLSearchParams({
    on_conflict: "id"
  });

  const { response, payload } = await callJson(`${supabaseUrl}/rest/v1/profiles?${query.toString()}`, {
    method: "POST",
    headers: serviceHeaders({
      "content-type": "application/json; charset=utf-8",
      prefer: "resolution=merge-duplicates,return=representation"
    }),
    body: JSON.stringify(profileInput)
  });

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Απέτυχε η αποθήκευση του profile.");
  }

  return mapProfileRow(Array.isArray(payload) ? payload[0] : payload);
}

async function updateProfile(profileId, profilePatch) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const query = new URLSearchParams({
    id: `eq.${profileId}`
  });

  const { response, payload } = await callJson(`${supabaseUrl}/rest/v1/profiles?${query.toString()}`, {
    method: "PATCH",
    headers: serviceHeaders({
      "content-type": "application/json; charset=utf-8",
      prefer: "return=representation"
    }),
    body: JSON.stringify(profilePatch)
  });

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Απέτυχε η ενημέρωση του χρήστη.");
  }

  return mapProfileRow(Array.isArray(payload) ? payload[0] : payload);
}

async function createAuthUser(userInput) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const role = sanitizeRole(userInput.role);
  const displayName = sanitizeText(userInput.displayName, 160);
  const companyName = sanitizeText(userInput.companyName, 160);
  const title = sanitizeText(userInput.title, 160) || defaultTitleForRole(role);
  const email = sanitizeEmail(userInput.email);
  const password = String(userInput.password || "");

  if (!email) {
    throw new Error("Χρειάζεται email για τη δημιουργία χρήστη.");
  }

  if (password.length < 6) {
    throw new Error("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.");
  }

  const { response, payload } = await callJson(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders({
      "content-type": "application/json; charset=utf-8"
    }),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        display_name: displayName,
        company_name: companyName,
        title
      }
    })
  });

  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || payload?.error || "Απέτυχε η δημιουργία auth user.");
  }

  const authUser = payload?.user || payload;
  if (!authUser?.id) {
    throw new Error("Η Supabase δεν επέστρεψε έγκυρο auth user.");
  }

  return upsertProfile({
    id: authUser.id,
    email,
    role,
    display_name: displayName || email.split("@")[0],
    company_name: companyName || displayName || email.split("@")[0],
    title,
    is_active: true
  });
}

async function handleCreateUser(body) {
  return createAuthUser(body || {});
}

async function handleUpdateUser(callerProfile, body) {
  const profileId = sanitizeText(body.id, 80);
  if (!profileId) {
    throw new Error("Λείπει το id του χρήστη.");
  }

  const existingProfile = await fetchProfileById(profileId);
  if (!existingProfile) {
    throw new Error("Ο χρήστης δεν βρέθηκε.");
  }

  const nextRole = sanitizeRole(body.role || existingProfile.role || "partner");
  const nextIsActive = body.isActive === undefined ? existingProfile.isActive !== false : sanitizeBoolean(body.isActive);

  if (callerProfile.id === profileId && nextRole !== "admin") {
    throw new Error("Ο τρέχων admin δεν μπορεί να αλλάξει τον δικό του ρόλο από εδώ.");
  }

  if (callerProfile.id === profileId && nextIsActive === false) {
    throw new Error("Ο τρέχων admin δεν μπορεί να απενεργοποιήσει τον δικό του λογαριασμό.");
  }

  return updateProfile(profileId, {
    display_name: sanitizeText(body.displayName, 160) || existingProfile.displayName || existingProfile.email,
    company_name: sanitizeText(body.companyName, 160) || sanitizeText(body.displayName, 160) || existingProfile.companyName,
    title: sanitizeText(body.title, 160) || existingProfile.title || defaultTitleForRole(nextRole),
    role: nextRole,
    is_active: nextIsActive
  });
}

export async function handler(event) {
  try {
    if (!["GET", "POST", "PATCH"].includes(event.httpMethod)) {
      return json(405, { error: "Η μέθοδος δεν υποστηρίζεται." });
    }

    const { profile: callerProfile } = await assertCallerIsAdmin(event);

    if (event.httpMethod === "GET") {
      const users = await listProfiles();
      return json(200, { users });
    }

    const body = await parseJsonBody(event);

    if (event.httpMethod === "POST") {
      const user = await handleCreateUser(body);
      return json(200, { user });
    }

    const user = await handleUpdateUser(callerProfile, body);
    return json(200, { user });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    return json(statusCode, {
      error: error?.message || "Η διαχείριση χρηστών απέτυχε."
    });
  }
}
