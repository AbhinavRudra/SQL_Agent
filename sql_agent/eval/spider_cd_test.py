"""
evaluate_sql_model.py

End-to-end evaluation of a fine-tuned Text-to-SQL model (base vs. fine-tuned),
built for the CAV-SQL project.

What it does:
  1. Loads a stratified sample of the Spider dev set (by difficulty).
  2. Generates SQL from BOTH the base model and your fine-tuned Ollama model.
  3. Scores each with: Exact Match, Execution Accuracy, Hallucinated-JOIN count
     (reusing your sqlglot AST verification logic), and latency.
  4. Runs your bounded self-correction loop (up to 3 iterations) and tracks
     the fix rate per iteration.
  5. Prints a summary table and writes results to CSV + a markdown table
     you can paste straight into your README/resume notes.

Prereqs:
  pip install datasets sqlglot pandas requests tqdm

  - Ollama running locally with BOTH models pulled/available:
      ollama run llama3:8b            (or your base model tag)
      ollama run your-finetuned-model (your GGUF import, e.g. `ollama create ...`)
  - Spider dataset + sqlite db files. Easiest path:
      git clone https://github.com/taoyds/spider.git
    This gives you spider/database/<db_id>/<db_id>.sqlite and spider/tables.json,
    which SPIDER_DB_ROOT / SPIDER_TABLES_JSON below should point at.

Usage:
  python evaluate_sql_model.py --n_samples 200 --seed 42
"""

import argparse
import json
import re
import sqlite3
import time
from pathlib import Path
from collections import defaultdict

import pandas as pd
import requests
from tqdm import tqdm

try:
    import sqlglot
    from sqlglot import exp
except ImportError:
    sqlglot = None
    print("WARNING: sqlglot not installed — hallucinated-JOIN checks will be skipped.")

from datasets import load_dataset


# --------------------------------------------------------------------------
# CONFIG — edit these for your setup
# --------------------------------------------------------------------------

OLLAMA_URL = "http://localhost:11434/api/generate"
BASE_MODEL_TAG = "llama3:8b"              # your base model in Ollama
FINETUNED_MODEL_TAG = "cav-sql-finetuned"  # the GGUF model you imported into Ollama

SPIDER_DB_ROOT = Path("./spider/database")     # folder containing <db_id>/<db_id>.sqlite
SPIDER_TABLES_JSON = Path("./spider/tables.json")  # schema + foreign key definitions

MAX_SELF_CORRECT_ITERS = 3
LATENCY_SAMPLE_SIZE = 20  # how many generations to time separately for latency stats


# --------------------------------------------------------------------------
# Schema / FK loading
# --------------------------------------------------------------------------

def load_schema_index(tables_json_path):
    """Build a lookup: db_id -> {tables, columns, foreign_keys, schema_text}"""
    with open(tables_json_path) as f:
        tables_data = json.load(f)

    schema_index = {}
    for db in tables_data:
        db_id = db["db_id"]
        table_names = db["table_names_original"]
        column_info = db["column_names_original"]  # list of [table_idx, col_name]
        fk_pairs = db["foreign_keys"]  # list of [col_idx1, col_idx2]

        # Build human-readable schema text for the prompt
        cols_by_table = defaultdict(list)
        for tbl_idx, col_name in column_info:
            if tbl_idx == -1:
                continue
            cols_by_table[table_names[tbl_idx]].append(col_name)

        schema_lines = []
        for tbl in table_names:
            cols = ", ".join(cols_by_table[tbl])
            schema_lines.append(f"{tbl}({cols})")
        schema_text = "\n".join(schema_lines)

        # Build FK set as (table.col, table.col) pairs for hallucination checking
        fks = set()
        for c1_idx, c2_idx in fk_pairs:
            t1_idx, col1 = column_info[c1_idx]
            t2_idx, col2 = column_info[c2_idx]
            t1, t2 = table_names[t1_idx], table_names[t2_idx]
            fks.add(frozenset([f"{t1}.{col1}", f"{t2}.{col2}"]))

        schema_index[db_id] = {
            "schema_text": schema_text,
            "foreign_keys": fks,
            "tables": set(table_names),
        }
    return schema_index


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------

def build_prompt(question, schema_text):
    return (
        f"### Database Schema:\n{schema_text}\n\n"
        f"### Question:\n{question}\n\n"
        f"### SQL:\n"
    )


def generate_sql(prompt, model_tag, timeout=60):
    resp = requests.post(
        OLLAMA_URL,
        json={"model": model_tag, "prompt": prompt, "stream": False},
        timeout=timeout,
    )
    resp.raise_for_status()
    raw = resp.json()["response"].strip()
    return clean_sql_output(raw)


def clean_sql_output(text):
    """Strip markdown fences / trailing commentary the model might add."""
    text = re.sub(r"```sql|```", "", text)
    # Keep everything up to the first semicolon if present, else the whole thing
    if ";" in text:
        text = text.split(";")[0] + ";"
    return text.strip()


# --------------------------------------------------------------------------
# Scoring: Exact Match
# --------------------------------------------------------------------------

def normalize_sql(sql):
    return " ".join(sql.strip().lower().replace(";", "").split())


def exact_match(pred, gold):
    return normalize_sql(pred) == normalize_sql(gold)


# --------------------------------------------------------------------------
# Scoring: Execution Accuracy
# --------------------------------------------------------------------------

def get_db_path(db_id):
    return SPIDER_DB_ROOT / db_id / f"{db_id}.sqlite"


def execution_accuracy(pred_sql, gold_sql, db_id):
    db_path = get_db_path(db_id)
    if not db_path.exists():
        return None  # can't evaluate, db missing

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    try:
        cur.execute(pred_sql)
        pred_result = set(cur.fetchall())
    except Exception:
        conn.close()
        return False  # invalid SQL = fail

    try:
        cur.execute(gold_sql)
        gold_result = set(cur.fetchall())
    except Exception:
        conn.close()
        return None  # gold query itself failed — skip, don't penalize model

    conn.close()
    return pred_result == gold_result


# --------------------------------------------------------------------------
# Scoring: Hallucinated JOINs (reuses your CAV-SQL verification logic)
# --------------------------------------------------------------------------

def count_hallucinated_joins(sql, db_id, schema_index):
    """
    Parses SQL, finds JOIN clauses, and checks whether the join condition
    corresponds to a real foreign-key relationship in the schema.
    Returns the count of joins that do NOT match a known FK pair.
    """
    if sqlglot is None:
        return None

    entry = schema_index.get(db_id)
    if entry is None:
        return None
    valid_fks = entry["foreign_keys"]

    try:
        parsed = sqlglot.parse_one(sql, read="sqlite")
    except Exception:
        return None  # unparsable — counted separately as invalid SQL, not here

    hallucinated = 0
    joins = list(parsed.find_all(exp.Join))
    for join in joins:
        on_clause = join.args.get("on")
        if on_clause is None:
            continue
        cols = list(on_clause.find_all(exp.Column))
        if len(cols) < 2:
            continue
        # crude table.column pair extraction from the join condition
        refs = []
        for c in cols[:2]:
            tbl = c.table if c.table else ""
            refs.append(f"{tbl}.{c.name}")
        pair = frozenset(refs)
        if pair not in valid_fks:
            hallucinated += 1
    return hallucinated


# --------------------------------------------------------------------------
# Bounded self-correction loop (mirrors your CAV-SQL agent behavior)
# --------------------------------------------------------------------------

def self_correcting_generate(question, db_id, schema_index, model_tag, max_iters=3):
    """
    Generates SQL, checks it against the verification gate, and if it fails,
    feeds structured error feedback back to the model for up to `max_iters`
    correction attempts. Returns (final_sql, iterations_used, fixed).
    """
    entry = schema_index[db_id]
    schema_text = entry["schema_text"]
    prompt = build_prompt(question, schema_text)

    for i in range(max_iters + 1):
        sql = generate_sql(prompt, model_tag)
        halluc_count = count_hallucinated_joins(sql, db_id, schema_index)

        if halluc_count == 0 or halluc_count is None:
            return sql, i, True if i > 0 else None  # fixed=None means no fix was needed

        if i < max_iters:
            error_feedback = (
                f"The previous SQL had {halluc_count} JOIN(s) referencing columns "
                f"that are not related by a foreign key in this schema. "
                f"Only join tables using the foreign key relationships listed above.\n"
                f"Previous SQL: {sql}\n"
                f"Please correct it.\n### SQL:\n"
            )
            prompt = build_prompt(question, schema_text) + error_feedback

    return sql, max_iters, False  # exhausted retries, still broken


# --------------------------------------------------------------------------
# Latency measurement
# --------------------------------------------------------------------------

def measure_latency(question, schema_text, model_tag, n=LATENCY_SAMPLE_SIZE):
    prompt = build_prompt(question, schema_text)
    times = []
    for _ in range(n):
        start = time.time()
        generate_sql(prompt, model_tag)
        times.append(time.time() - start)
    return sum(times) / len(times)


# --------------------------------------------------------------------------
# Main evaluation loop
# --------------------------------------------------------------------------

def run_evaluation(n_samples, seed):
    print("Loading Spider dev set...")
    spider = load_dataset("xlangai/spider")
    dev_set = spider["validation"]

    print("Loading schema index...")
    schema_index = load_schema_index(SPIDER_TABLES_JSON)

    # Stratified-ish sample: just shuffle and take n, filtering to dbs we have locally
    dev_set = dev_set.shuffle(seed=seed)
    available = [
        ex for ex in dev_set
        if get_db_path(ex["db_id"]).exists() and ex["db_id"] in schema_index
    ]
    sample = available[:n_samples]
    print(f"Evaluating on {len(sample)} examples.")

    all_rows = []
    correction_stats = defaultdict(lambda: defaultdict(int))  # model -> iter -> count

    for model_name, model_tag in [("base", BASE_MODEL_TAG), ("finetuned", FINETUNED_MODEL_TAG)]:
        print(f"\n=== Evaluating {model_name} ({model_tag}) ===")
        for ex in tqdm(sample):
            db_id = ex["db_id"]
            question = ex["question"]
            gold_sql = ex["query"]
            schema_text = schema_index[db_id]["schema_text"]

            # plain single-shot generation (no self-correction) for exact-match/exec-acc
            prompt = build_prompt(question, schema_text)
            try:
                pred_sql = generate_sql(prompt, model_tag)
            except Exception as e:
                print(f"generation failed for {db_id}: {e}")
                continue

            em = exact_match(pred_sql, gold_sql)
            exec_acc = execution_accuracy(pred_sql, gold_sql, db_id)
            halluc = count_hallucinated_joins(pred_sql, db_id, schema_index)

            # self-correction loop, tracked separately
            _, iters_used, fixed = self_correcting_generate(
                question, db_id, schema_index, model_tag, max_iters=MAX_SELF_CORRECT_ITERS
            )
            if fixed is True:
                correction_stats[model_name][iters_used] += 1

            all_rows.append({
                "model": model_name,
                "db_id": db_id,
                "question": question,
                "pred_sql": pred_sql,
                "gold_sql": gold_sql,
                "exact_match": em,
                "execution_accuracy": exec_acc,
                "hallucinated_joins": halluc,
            })

    df = pd.DataFrame(all_rows)
    df.to_csv("sql_eval_results_raw.csv", index=False)

    # ---- Latency, measured separately on a smaller sample ----
    print("\nMeasuring latency...")
    latency_question = sample[0]["question"]
    latency_schema = schema_index[sample[0]["db_id"]]["schema_text"]
    latencies = {}
    for model_name, model_tag in [("base", BASE_MODEL_TAG), ("finetuned", FINETUNED_MODEL_TAG)]:
        latencies[model_name] = measure_latency(latency_question, latency_schema, model_tag)

    # ---- Summary table ----
    summary_rows = []
    for model_name in ["base", "finetuned"]:
        sub = df[df["model"] == model_name]
        exec_valid = sub["execution_accuracy"].dropna()
        halluc_valid = sub["hallucinated_joins"].dropna()

        summary_rows.append({
            "Model": model_name,
            "Exact Match %": round(sub["exact_match"].mean() * 100, 1),
            "Execution Accuracy %": round(exec_valid.mean() * 100, 1) if len(exec_valid) else None,
            "Avg Hallucinated JOINs": round(halluc_valid.mean(), 2) if len(halluc_valid) else None,
            "Avg Latency (s)": round(latencies[model_name], 2),
        })

    summary_df = pd.DataFrame(summary_rows)
    print("\n=== SUMMARY ===")
    print(summary_df.to_string(index=False))
    summary_df.to_csv("sql_eval_summary.csv", index=False)

    # ---- Self-correction stats ----
    print("\n=== SELF-CORRECTION FIX RATE (by iteration) ===")
    for model_name in ["base", "finetuned"]:
        total_flagged = sum(correction_stats[model_name].values())
        print(f"{model_name}: {dict(correction_stats[model_name])} (total fixed across iters: {total_flagged})")

    # ---- Markdown table for README/resume notes ----
    md_lines = ["| Model | Exact Match | Execution Accuracy | Avg Hallucinated JOINs | Avg Latency |",
                "|---|---|---|---|---|"]
    for row in summary_rows:
        md_lines.append(
            f"| {row['Model']} | {row['Exact Match %']}% | {row['Execution Accuracy %']}% | "
            f"{row['Avg Hallucinated JOINs']} | {row['Avg Latency (s)']}s |"
        )
    md_table = "\n".join(md_lines)
    with open("sql_eval_summary.md", "w") as f:
        f.write(md_table)

    print("\n=== MARKDOWN TABLE (paste into README) ===")
    print(md_table)

    print("\nSaved: sql_eval_results_raw.csv, sql_eval_summary.csv, sql_eval_summary.md")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n_samples", type=int, default=200,
                         help="Number of Spider dev examples to evaluate per model.")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    run_evaluation(n_samples=args.n_samples, seed=args.seed)
