/**
 * Public routes for the /pesquisa web survey (post-purchase feedback).
 *
 * This is the EMAIL/WEB channel of the feedback system: buyers reach the page
 * through a signed link (e-mailed when WhatsApp is unavailable) or by typing
 * their customer e-mail at the gate — a valid customer e-mail opens the
 * survey on the spot (product decision: confirming customer status on screen
 * is accepted; the rate limit below blunts enumeration abuse). No auth
 * middleware — the signed token IS the auth for loading/submitting.
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { verifyFeedbackToken } from '../lib/feedbackToken';
import {
  getWebSurveyState,
  openSurveyByEmail,
  submitWebSurvey,
} from '../services/feedback.service';
import { FEEDBACK_QUESTIONS } from '../lib/feedbackQuestions';

const router = Router();

const openByEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

// GET /api/feedback/survey?token=…
// Renders the form: questions + options + already-answered map (partial
// WhatsApp votes are pre-filled and locked on the page).
router.get('/survey', async (req: Request, res: Response) => {
  try {
    const surveyId = verifyFeedbackToken(String(req.query.token || ''));
    if (!surveyId) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    const state = await getWebSurveyState(surveyId);
    if (!state) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    return res.json(state);
  } catch (error) {
    console.error('[FEEDBACK-PUBLIC] GET /survey failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar a pesquisa.' });
  }
});

const submitSchema = z.object({
  token: z.preprocess((v) => String(v ?? '').trim(), z.string().min(1)),
  answers: z.record(z.string(), z.number().int().min(1).max(4)),
  suggestion: z
    .preprocess((v) => String(v ?? '').trim(), z.string().max(4000))
    .optional(),
});

// POST /api/feedback/survey/submit { token, answers: {key: 1..4}, suggestion? }
// Completes BOTH sessions (feedback + suggestion). Second submit → 409.
router.post('/survey/submit', submitLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = submitSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });

    const surveyId = verifyFeedbackToken(parsed.data.token);
    if (!surveyId) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    for (const q of FEEDBACK_QUESTIONS) {
      if (parsed.data.answers[q.key] == null) {
        return res.status(400).json({ error: 'Responda todas as perguntas antes de enviar.' });
      }
    }

    const result = await submitWebSurvey({
      surveyId,
      answers: parsed.data.answers,
      suggestion: parsed.data.suggestion,
    });
    if (!result.ok) {
      if (result.code === 'already-completed') {
        return res.status(409).json({ error: 'Esta pesquisa já foi respondida. Obrigado!' });
      }
      if (result.code === 'invalid-answers') {
        return res.status(400).json({ error: 'Responda todas as perguntas antes de enviar.' });
      }
      return res.status(400).json({ error: 'Link inválido ou expirado.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[FEEDBACK-PUBLIC] POST /survey/submit failed:', error);
    return res.status(500).json({ error: 'Erro ao enviar a pesquisa.' });
  }
});

const openByEmailSchema = z.object({
  email: z
    .preprocess((v) => String(v ?? '').trim(), z.string())
    .refine((s) => s.length > 0, { message: 'Informe o e-mail.' }),
});

// POST /api/feedback/open-by-email { email }
// Valid customer e-mail (current or former, has paid at least once) → returns
// a signed survey token so the page opens the form immediately.
router.post('/open-by-email', openByEmailLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = openByEmailSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Informe o e-mail.' });

    const result = await openSurveyByEmail(parsed.data.email);
    if (!result.ok) {
      if (result.code === 'already-completed') {
        return res.status(409).json({ error: 'Esta pesquisa já foi respondida com esse e-mail. Obrigado!' });
      }
      return res.status(404).json({
        error: 'Não encontramos uma conta de cliente com esse e-mail. Confira se é o mesmo e-mail usado na compra.',
      });
    }
    return res.json({ success: true, token: result.token });
  } catch (error) {
    console.error('[FEEDBACK-PUBLIC] POST /open-by-email failed:', error);
    return res.status(500).json({ error: 'Erro ao verificar o e-mail. Tente novamente.' });
  }
});

export default router;
