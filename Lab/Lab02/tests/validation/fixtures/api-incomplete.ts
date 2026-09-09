export default async function register(request: Request): Promise<Response> {
  const input = (await request.json()) as Record<string, unknown>;
  return Response.json({ ...input, sessionToken: "token" }, { status: 201 });
}
