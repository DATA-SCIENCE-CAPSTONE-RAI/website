-- Responsible AI evaluation workbook, stored as three tables.
-- Flags are 1, 0, or NULL. NULL means the metric does not apply or cannot be judged.

CREATE TABLE evaluation_runs (
  id INTEGER PRIMARY KEY,
  judge_name TEXT NOT NULL,
  evaluation_date TEXT NOT NULL,
  input_workbook_name TEXT NOT NULL,
  evaluation_prompt_version TEXT NOT NULL,
  evaluated_models TEXT NOT NULL,
  number_of_cases_evaluated INTEGER NOT NULL,
  number_of_model_responses_evaluated INTEGER NOT NULL,
  number_of_sycon_turns_evaluated INTEGER NOT NULL,
  evaluation_notes TEXT
);

CREATE TABLE case_evaluations (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES evaluation_runs(id),
  case_id TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  protected_class_category TEXT,
  prompt_variant TEXT,
  evaluated_model TEXT NOT NULL,
  bbq_stereotype_answer INTEGER,
  bbq_counter_stereotype_answer INTEGER,
  bbq_unknown_answer INTEGER,
  bbq_answer_correct INTEGER,
  bbq_context_answerable INTEGER,
  bbq_appropriate_abstention INTEGER,
  bbq_answer_when_answerable INTEGER,
  bbg_pair_id TEXT,
  bbg_version TEXT,
  bbg_primary_stereotype_reinforced INTEGER,
  bbg_primary_stereotype_challenged INTEGER,
  wildguard_response_harmful INTEGER,
  wildguard_response_refusal INTEGER,
  evaluation_evidence TEXT,
  evaluation_explanation TEXT,
  judgment_confidence TEXT,
  null_reason TEXT,
  judge_notes TEXT
);

CREATE TABLE sycon_turns (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES evaluation_runs(id),
  case_id TEXT NOT NULL,
  sycon_conversation_id TEXT NOT NULL,
  evaluated_model TEXT NOT NULL,
  sycon_turn_number INTEGER NOT NULL,
  sycon_sycophantic_flip INTEGER,
  sycon_evidence TEXT,
  sycon_judgment_notes TEXT,
  judgment_confidence TEXT,
  null_reason TEXT
);

CREATE INDEX idx_case_evaluations_run ON case_evaluations(run_id);
CREATE INDEX idx_sycon_turns_run ON sycon_turns(run_id);

-- Tables written by the fairness scoring script. Score = 1 - failure rate. Higher is better.
-- A blank cap or verdict means pass or fail has not been set.

CREATE TABLE score_summary (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES evaluation_runs(id),
  judge TEXT NOT NULL,
  model TEXT NOT NULL,
  test TEXT NOT NULL,
  score REAL,
  failure_rate_class_balanced REAL,
  pooled_failures INTEGER,
  n INTEGER,
  ci95_low REAL,
  ci95_high REAL,
  weight REAL,
  cap REAL,
  verdict TEXT
);

CREATE TABLE score_by_class (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES evaluation_runs(id),
  judge TEXT NOT NULL,
  model TEXT NOT NULL,
  test TEXT NOT NULL,
  class TEXT NOT NULL,
  failures INTEGER NOT NULL,
  n INTEGER NOT NULL,
  failure_rate REAL NOT NULL
);

CREATE TABLE derived_replies (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES evaluation_runs(id),
  judge TEXT NOT NULL,
  model TEXT NOT NULL,
  test TEXT NOT NULL,
  reply_id TEXT NOT NULL,
  cls TEXT,
  variant TEXT,
  answer_correct INTEGER,
  appropriate_abstention INTEGER,
  reinforced INTEGER,
  challenged INTEGER,
  names_a_person INTEGER,
  negative_actor TEXT,
  positive_actor TEXT,
  expected_letter TEXT,
  selected_letter TEXT,
  read_by TEXT
);

CREATE TABLE judge_output (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES evaluation_runs(id),
  record_id TEXT NOT NULL,
  anonymous_response_id TEXT NOT NULL,
  negative_actor TEXT,
  positive_actor TEXT,
  stereotype_reinforced INTEGER,
  stereotype_challenged INTEGER,
  negative_actor_evidence TEXT,
  positive_actor_evidence TEXT,
  narrative_evidence TEXT,
  validity TEXT,
  judgment_confidence TEXT,
  null_reason TEXT,
  judge_notes TEXT
);

CREATE INDEX idx_score_summary_run ON score_summary(run_id);
CREATE INDEX idx_score_by_class_run ON score_by_class(run_id);
CREATE INDEX idx_derived_replies_run ON derived_replies(run_id);
CREATE INDEX idx_judge_output_run ON judge_output(run_id);
