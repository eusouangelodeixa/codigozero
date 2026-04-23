import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }

    const token = jwt.sign(
      { userId: user.id },
      env.JWT_SECRET,
      { expiresIn: '7d' as any }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        dailySearchCount: true,
        lastSearchDate: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('[AUTH] Get me error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PATCH /api/auth/profile — update own profile
router.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone } = req.body;
    const data: any = {};
    if (name) data.name = name;
    if (phone) data.phone = phone;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, subscriptionStatus: true, subscriptionEnd: true },
    });

    return res.json({ user });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Este telefone já está em uso.' });
    return res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// PATCH /api/auth/password — change own password
router.patch('/password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Preencha ambos os campos.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Senha atual incorreta.' });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    return res.json({ success: true, message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

export default router;
