import { NextResponse } from "next/server";
import { isAdmin } from "@/server/admin/is-admin";
import { listAdminUsers } from "@/server/admin/admin-users.service";
import {
  envAdminUsersPageLimitDefault,
  envAdminUsersPageLimitMax,
  envAdminUsersPageLimitMin,
} from "@/lib/env-server";

export async function GET(request: Request) {
  const gate = await isAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const sortByRaw = searchParams.get("sortBy") ?? "createdAt";
  const orderRaw = searchParams.get("order") ?? "desc";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    envAdminUsersPageLimitMax(),
    Math.max(
      envAdminUsersPageLimitMin(),
      Number.parseInt(searchParams.get("limit") ?? String(envAdminUsersPageLimitDefault()), 10) ||
        envAdminUsersPageLimitDefault()
    )
  );

  const sortBy =
    sortByRaw === "email" || sortByRaw === "lastSeenAt" || sortByRaw === "createdAt"
      ? sortByRaw
      : "createdAt";
  const order: 1 | -1 = orderRaw === "asc" ? 1 : -1;

  try {
    const { users, total } = await listAdminUsers({
      search: search || undefined,
      sortBy,
      order,
      skip: (page - 1) * limit,
      limit,
    });
    return NextResponse.json({ users, total, page, limit });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}
