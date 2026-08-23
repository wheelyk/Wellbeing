import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { isAdminEmail } from "../lib/isAdmin";

// Must run after requireAuth (relies on req.userId already being set - see app.ts's mount
// order). Looked up fresh from the database rather than trusted from anything on the request
// itself, since the access token's payload carries only a user id (see jwt.ts), never an email -
// and email is the one thing ADMIN_EMAIL is ever compared against.
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });

  if (!user || !isAdminEmail(user.email)) {
    res.status(403).json({ error: { message: "Admin access required", code: "FORBIDDEN" } });
    return;
  }

  next();
}
