// Shared pagination helpers for admin list endpoints.
//
// pageArgs() parses ?page & ?pageSize from the query and returns Prisma-ready
// skip/take. Defaults: page=1, pageSize=25. pageSize is clamped to [1, 100] and
// page to a minimum of 1, so a caller can never ask for the whole table or a
// negative offset.
//
// paginated() wraps a page of rows + the (unpaginated) total count into the
// canonical envelope every admin list now returns.

// Loose request shape so any Express-like request (AuthRequest included) works.
type QueryReq = { query: Record<string, any> };

export function pageArgs(req: QueryReq) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
