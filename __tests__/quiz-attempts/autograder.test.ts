import { describe, expect, it } from 'vitest';
import { QuestionType } from '@prisma/client';

import { gradeQuestion, type AutogradeQuestion } from '@/lib/quiz-attempts/autograder';

function q(overrides: Partial<AutogradeQuestion>): AutogradeQuestion {
  return {
    id: 'q',
    type: QuestionType.SINGLE_CHOICE,
    points: 10,
    expectedAnswer: null,
    options: [],
    ...overrides,
  };
}

describe('autograder — SINGLE_CHOICE', () => {
  const question = q({
    type: QuestionType.SINGLE_CHOICE,
    options: [
      { id: 'a', isCorrect: false, text: 'A' },
      { id: 'b', isCorrect: true, text: 'B' },
      { id: 'c', isCorrect: false, text: 'C' },
    ],
  });

  it('awards full points for the correct option', () => {
    expect(gradeQuestion(question, { optionId: 'b' })).toEqual({
      isCorrect: true,
      pointsAwarded: 10,
    });
  });

  it('returns 0 for an incorrect option', () => {
    expect(gradeQuestion(question, { optionId: 'a' })).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });

  it('returns 0 for malformed payload', () => {
    expect(gradeQuestion(question, { wrong: 'shape' })).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
    expect(gradeQuestion(question, null)).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });
});

describe('autograder — MULTIPLE_CHOICE', () => {
  const question = q({
    type: QuestionType.MULTIPLE_CHOICE,
    options: [
      { id: 'a', isCorrect: true, text: 'A' },
      { id: 'b', isCorrect: true, text: 'B' },
      { id: 'c', isCorrect: false, text: 'C' },
      { id: 'd', isCorrect: false, text: 'D' },
    ],
  });

  it('full points only for the exact correct set', () => {
    expect(gradeQuestion(question, { optionIds: ['a', 'b'] }).pointsAwarded).toBe(10);
  });

  it('zero for missing one correct answer (no partial credit)', () => {
    expect(gradeQuestion(question, { optionIds: ['a'] }).pointsAwarded).toBe(0);
  });

  it('zero for selecting any incorrect answer alongside correct ones', () => {
    expect(gradeQuestion(question, { optionIds: ['a', 'b', 'c'] }).pointsAwarded).toBe(0);
  });

  it('zero for empty selection', () => {
    expect(gradeQuestion(question, { optionIds: [] }).pointsAwarded).toBe(0);
  });
});

describe('autograder — TRUE_FALSE', () => {
  const question = q({
    type: QuestionType.TRUE_FALSE,
    options: [
      { id: 'a', isCorrect: false, text: 'True' },
      { id: 'b', isCorrect: true, text: 'False' },
    ],
  });

  it('rewards the right boolean (False)', () => {
    expect(gradeQuestion(question, { value: false }).pointsAwarded).toBe(10);
    expect(gradeQuestion(question, { value: true }).pointsAwarded).toBe(0);
  });

  it('returns 0 for missing / wrong-typed payload', () => {
    expect(gradeQuestion(question, { value: 'no' })).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });
});

describe('autograder — SHORT_ANSWER', () => {
  const question = q({
    type: QuestionType.SHORT_ANSWER,
    expectedAnswer: 'París',
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(gradeQuestion(question, { text: 'parís' }).pointsAwarded).toBe(10);
    expect(gradeQuestion(question, { text: '  París  ' }).pointsAwarded).toBe(10);
    expect(gradeQuestion(question, { text: 'PARÍS' }).pointsAwarded).toBe(10);
  });

  it('returns 0 for the wrong answer', () => {
    expect(gradeQuestion(question, { text: 'Madrid' }).pointsAwarded).toBe(0);
  });

  it('returns null when no expected answer is configured (manual review needed)', () => {
    const noExpected = q({ type: QuestionType.SHORT_ANSWER, expectedAnswer: null });
    expect(gradeQuestion(noExpected, { text: 'whatever' })).toEqual({
      isCorrect: null,
      pointsAwarded: null,
    });
  });
});

describe('autograder — LONG_ANSWER', () => {
  it('always returns null (manual grading required)', () => {
    const question = q({ type: QuestionType.LONG_ANSWER });
    expect(gradeQuestion(question, { text: 'Some long essay…' })).toEqual({
      isCorrect: null,
      pointsAwarded: null,
    });
  });
});
