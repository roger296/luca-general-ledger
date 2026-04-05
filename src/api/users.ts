import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { createUser, findUserById, listUsers, updateUser } from '../db/queries/users';
import { requirePermission } from './middleware/authorise';

// ---------------------------------------------------------------------------
// users.ts — User management endpoints (ADMIN only, except change-password)
// ---------------------------------------------------------------------------

export const usersRouter = Router();

/** GET /api/users — list all users (admin only) */
usersRouter.get('/', requirePermission('user:manage'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

/** POST /api/users — create a new user (admin only) */
usersRouter.post('/', requirePermission('user:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, display_name, roles } = req.body as {
      email?: string;
      password?: string;
      display_name?: string;
      roles?: string[];
    };

    if (!email || !password || !display_name) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'email, password, and display_name are required' },
      });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await createUser({ email, password_hash, display_name, roles: roles ?? [] });

    // Never return the password hash
    const { password_hash: _omit, ...safeUser } = user;
    res.status(201).json({ success: true, data: safeUser });
  } catch (err: unknown) {
    // Unique constraint violation (duplicate email)
    if (err instanceof Error && err.message.includes('unique') || err instanceof Error && err.message.includes('duplicate')) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_EMAIL', message: 'A user with this email already exists' },
      });
      return;
    }
    next(err);
  }
});

/** PUT /api/users/:id — update email, display_name, roles, is_active (admin only) */
usersRouter.put('/:id', requirePermission('user:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { email, display_name, roles, is_active } = req.body as {
      email?: string;
      display_name?: string;
      roles?: string[];
      is_active?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (email !== undefined) updates['email'] = email;
    if (display_name !== undefined) updates['display_name'] = display_name;
    if (roles !== undefined) updates['roles'] = roles;
    if (is_active !== undefined) updates['is_active'] = is_active;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CHANGES', message: 'No fields to update' },
      });
      return;
    }

    const updated = await updateUser(id, updates as Parameters<typeof updateUser>[1]);
    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `User ${id} not found` } });
      return;
    }

    const { password_hash: _omit, ...safeUser } = updated;
    res.json({ success: true, data: safeUser });
  } catch (err) {
    next(err);
  }
});

/** POST /api/users/:id/change-password — ADMIN or the user themselves */
usersRouter.post('/:id/change-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { current_password, new_password } = req.body as {
      current_password?: string;
      new_password?: string;
    };

    if (!new_password) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'new_password is required' },
      });
      return;
    }

    // Only ADMIN or the user themselves can change a password.
    const isSelf = req.userId === id;
    const isAdmin = (req.userRoles ?? []).includes('ADMIN');

    if (!isSelf && !isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only change your own password' },
      });
      return;
    }

    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `User ${id} not found` } });
      return;
    }

    // If changing own password, require current_password
    if (isSelf && !isAdmin) {
      if (!current_password) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'current_password is required to change your own password' },
        });
        return;
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) {
        res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
        });
        return;
      }
    }

    const new_hash = await bcrypt.hash(new_password, 10);
    const { db } = await import('../db/connection');
    await db('users').where('id', id).update({ password_hash: new_hash });

    res.json({ success: true, data: { message: 'Password updated successfully' } });
  } catch (err) {
    next(err);
  }
});
