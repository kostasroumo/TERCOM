function assertOk(response, payload, label) {
  if (!response.ok) {
    const message = payload?.error || payload?.message || `${label} απέτυχε`;
    throw new Error(message);
  }

  return payload;
}

async function callAdminUsersEndpoint(session, options = {}) {
  const response = await fetch("/.netlify/functions/admin-users", {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${session?.access_token || ""}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  return assertOk(response, payload, "Η κλήση διαχείρισης χρηστών");
}

export async function fetchAdminUsers(session) {
  const payload = await callAdminUsersEndpoint(session, { method: "GET" });
  return payload.users || [];
}

export async function createManagedUser(session, userInput) {
  const payload = await callAdminUsersEndpoint(session, {
    method: "POST",
    body: userInput
  });

  return payload.user;
}

export async function updateManagedUser(session, userInput) {
  const payload = await callAdminUsersEndpoint(session, {
    method: "PATCH",
    body: userInput
  });

  return payload.user;
}
