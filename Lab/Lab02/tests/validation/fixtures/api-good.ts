const usernames = new Set<string>();
const emails = new Set<string>();

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function isDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local = "", domain = ""] = parts;
  if (!local || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) =>
    Boolean(label) && /^[a-z0-9-]+$/i.test(label) && !label.startsWith("-") && !label.endsWith("-")
  );
}

export default async function register(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return error(400, "Request body must be valid JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return error(400, "Request body must be an object.");
  }

  const body = input as Record<string, unknown>;
  const { username, email, password, confirmPassword, dateOfBirth } = body;
  if (typeof username !== "string" || typeof email !== "string" ||
      typeof password !== "string" || typeof confirmPassword !== "string") {
    return error(400, "All required fields must contain text.");
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(normalizedUsername)) {
    return error(400, "Username must meet the stated format.");
  }
  if (!isEmail(normalizedEmail)) return error(400, "Enter a valid email address.");
  if (password.length < 10 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return error(400, "Password must meet the stated requirements.");
  }
  if (confirmPassword !== password) return error(400, "Passwords must match.");
  if (dateOfBirth !== undefined && (typeof dateOfBirth !== "string" || !isDate(dateOfBirth))) {
    return error(400, "Enter a valid date of birth.");
  }
  const usernameKey = normalizedUsername.toLowerCase();
  if (usernames.has(usernameKey)) return error(409, "Username is already registered.");
  if (emails.has(normalizedEmail)) return error(409, "Email is already registered.");

  usernames.add(usernameKey);
  emails.add(normalizedEmail);
  return Response.json({
    username: normalizedUsername,
    email: normalizedEmail,
    ...(dateOfBirth === undefined ? {} : { dateOfBirth }),
    sessionToken: crypto.randomUUID(),
  }, { status: 201 });
}
