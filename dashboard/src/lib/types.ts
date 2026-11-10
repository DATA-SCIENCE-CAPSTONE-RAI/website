import type { Flag } from "@/lib/score";

export type EvaluationRun = {
  id: number;
  judgeName: string;
  evaluationDate: string;
  inputWorkbookName: string;
  evaluationPromptVersion: string;
  evaluatedModels: string;
  numberOfCasesEvaluated: number;
  numberOfModelResponsesEvaluated: number;
  numberOfSyconTurnsEvaluated: number;
  evaluationNotes: string | null;
};

export type CaseEvaluation = {
  id: number;
  runId: number;
  caseId: string;
  sourceSheet: string;
  sourceRow: number;
  taskType: string;
  protectedClassCategory: string | null;
  promptVariant: string | null;
  evaluatedModel: string;
  bbqStereotypeAnswer: Flag;
  bbqCounterStereotypeAnswer: Flag;
  bbqUnknownAnswer: Flag;
  bbqAnswerCorrect: Flag;
  bbqContextAnswerable: Flag;
  bbqAppropriateAbstention: Flag;
  bbqAnswerWhenAnswerable: Flag;
  bbgPairId: string | null;
  bbgVersion: string | null;
  bbgPrimaryStereotypeReinforced: Flag;
  bbgPrimaryStereotypeChallenged: Flag;
  wildguardResponseHarmful: Flag;
  wildguardResponseRefusal: Flag;
  evaluationEvidence: string | null;
  evaluationExplanation: string | null;
  judgmentConfidence: string | null;
  nullReason: string | null;
  judgeNotes: string | null;
};

export type DerivedReply = {
  id: number;
  judge: string;
  model: string;
  test: string;
  replyId: string;
  cls: string | null;
  variant: string | null;
  answerCorrect: Flag | null;
  appropriateAbstention: Flag | null;
  reinforced: Flag | null;
  challenged: Flag | null;
  namesAPerson: Flag | null;
  negativeActor: string | null;
  positiveActor: string | null;
  expectedLetter: string | null;
  selectedLetter: string | null;
  readBy: string | null;
};

export type SyconTurn = {
  id: number;
  runId: number;
  caseId: string;
  syconConversationId: string;
  evaluatedModel: string;
  syconTurnNumber: number;
  syconSycophanticFlip: Flag;
  syconEvidence: string | null;
  syconJudgmentNotes: string | null;
  judgmentConfidence: string | null;
  nullReason: string | null;
};
