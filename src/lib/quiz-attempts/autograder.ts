import { QuestionType } from '@prisma/client';

/**
 * Auto-grading rules for each question type. The grader is intentionally
 * STRICT — when in doubt it returns `isCorrect: null` (manual review needed)
 * rather than guessing. This means the teacher decides edge cases.
 *
 *   SINGLE_CHOICE   : payload.optionId must equal the option flagged isCorrect
 *   MULTIPLE_CHOICE : exact-set match (all correct + no incorrect) — partial
 *                     credit is NOT given automatically (a real LMS often
 *                     debates this; we err on the side of unambiguous scoring)
 *   TRUE_FALSE      : payload.value matches the True/False option isCorrect
 *   SHORT_ANSWER    : case-insensitive, whitespace-trimmed match
 *   LONG_ANSWER     : always returns null — manual grading required
 */

export interface AutogradeQuestion {
  id: string;
  type: QuestionType;
  points: number;
  expectedAnswer: string | null;
  options: Array<{ id: string; isCorrect: boolean; text: string }>;
}

export interface AutogradeResult {
  isCorrect: boolean | null; // null = manual review needed
  pointsAwarded: number | null; // null when isCorrect is null
}

export function gradeQuestion(question: AutogradeQuestion, payload: unknown): AutogradeResult {
  switch (question.type) {
    case QuestionType.SINGLE_CHOICE:
      return gradeSingleChoice(question, payload);
    case QuestionType.MULTIPLE_CHOICE:
      return gradeMultipleChoice(question, payload);
    case QuestionType.TRUE_FALSE:
      return gradeTrueFalse(question, payload);
    case QuestionType.SHORT_ANSWER:
      return gradeShortAnswer(question, payload);
    case QuestionType.LONG_ANSWER:
      return { isCorrect: null, pointsAwarded: null };
  }
}

function gradeSingleChoice(q: AutogradeQuestion, payload: unknown): AutogradeResult {
  const optionId = readString(payload, 'optionId');
  if (!optionId) return zero(q);
  const correctOption = q.options.find((o) => o.isCorrect);
  if (!correctOption) return { isCorrect: null, pointsAwarded: null }; // malformed quiz
  const isCorrect = optionId === correctOption.id;
  return { isCorrect, pointsAwarded: isCorrect ? q.points : 0 };
}

function gradeMultipleChoice(q: AutogradeQuestion, payload: unknown): AutogradeResult {
  const optionIds = readStringArray(payload, 'optionIds');
  if (optionIds === null) return zero(q);
  const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
  const submittedIds = new Set(optionIds);

  // All correct present + no extras = full credit. Otherwise zero (no partial).
  const allCorrectPresent = [...correctIds].every((id) => submittedIds.has(id));
  const noExtras = [...submittedIds].every((id) =>
    q.options.some((o) => o.id === id && o.isCorrect),
  );
  const isCorrect = allCorrectPresent && noExtras;
  return { isCorrect, pointsAwarded: isCorrect ? q.points : 0 };
}

function gradeTrueFalse(q: AutogradeQuestion, payload: unknown): AutogradeResult {
  const value = readBoolean(payload, 'value');
  if (value === null) return zero(q);
  const correctOption = q.options.find((o) => o.isCorrect);
  if (!correctOption) return { isCorrect: null, pointsAwarded: null };
  const correctValue = correctOption.text.toLowerCase() === 'true';
  const isCorrect = value === correctValue;
  return { isCorrect, pointsAwarded: isCorrect ? q.points : 0 };
}

function gradeShortAnswer(q: AutogradeQuestion, payload: unknown): AutogradeResult {
  const text = readString(payload, 'text');
  if (!text) return zero(q);
  if (!q.expectedAnswer) {
    // No expected answer configured — fall back to manual grading.
    return { isCorrect: null, pointsAwarded: null };
  }
  const normalized = text.trim().toLowerCase();
  const expected = q.expectedAnswer.trim().toLowerCase();
  const isCorrect = normalized === expected;
  return { isCorrect, pointsAwarded: isCorrect ? q.points : 0 };
}

// ---- payload readers (defensive against malformed client JSON) ---------

function readString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function readStringArray(payload: unknown, key: string): string[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return null;
  return value.every((v) => typeof v === 'string') ? (value as string[]) : null;
}

function readBoolean(payload: unknown, key: string): boolean | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

function zero(q: AutogradeQuestion): AutogradeResult {
  return { isCorrect: false, pointsAwarded: 0 };
}
