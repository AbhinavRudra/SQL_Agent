import json
from typing import Union
import sqlglot
import sqlglot.expressions as exp


class CAVEngine:
    def __init__(self, schema_rules: Union[str, dict]):
        if isinstance(schema_rules, str):
            with open(schema_rules) as f:
                self.schema = json.load(f)
        else:
            self.schema = schema_rules
    def verify_query(self, sql_string: str) -> str:
        try:
            statements = sqlglot.parse(sql_string, dialect="postgres")
        except Exception as e:
            return f"Error: SQL parse failure — {e}"

        if not statements:
            return "Error: Empty SQL statement."

        stmt = statements[0]

        col_error = self._check_columns(stmt)
        if col_error:
            return col_error

        join_error = self._check_joins(stmt)
        if join_error:
            return join_error

        return "PASS"
    
    def _get_aliases(self, stmt) -> set[str]:
        """Collect all SELECT-level column aliases so we don't flag them."""
        aliases = set()
        for alias_expr in stmt.find_all(exp.Alias):
            aliases.add(alias_expr.alias.lower())
        return aliases

    
    def _resolve_alias(self, stmt) -> dict[str, str]:
        alias_map: dict[str, str] = {}
        # Collect subquery aliases — these are derived tables, not real schema tables
        subquery_aliases = set()
        for subq in stmt.find_all(exp.Subquery):
            if subq.alias:
                subquery_aliases.add(subq.alias.lower())

        for table_expr in stmt.find_all(exp.Table):
            real = table_expr.name.lower()
            alias = (table_expr.alias or real).lower()
            if real not in subquery_aliases:         # ← skip derived tables
                alias_map[alias] = real
        return alias_map

    def _check_columns(self, stmt) -> str:
        alias_map = self._resolve_alias(stmt)
        defined_aliases = self._get_aliases(stmt)   # ← add this
        tables_in_query = set(alias_map.values())

        for col in stmt.find_all(exp.Column):
            col_name = col.name.lower()

            if col_name in defined_aliases:          # ← skip aliases
                continue
            if col_name == "*":
                continue
                
            table_ref = (col.table or "").lower()

            if table_ref:
                real_table = alias_map.get(table_ref, table_ref)

                if real_table not in self.schema["tables"]:
                    return (
                        f"Error: Table '{real_table}' not found in schema. "
                        f"Available tables: {list(self.schema['tables'].keys())}."
                    )

                allowed_cols = {
                    c.lower()
                    for c in self.schema["tables"][real_table]["columns"]
                }

                if col_name not in allowed_cols and col_name != "*":
                    return (
                        f"Error: Column '{col_name}' does not exist in table '{real_table}'. "
                        f"Available columns: {sorted(allowed_cols)}."
                    )

            else:
                found = False
                for t in tables_in_query:
                    if t in self.schema["tables"]:
                        allowed = {
                            c.lower()
                            for c in self.schema["tables"][t]["columns"]
                        }
                        if col_name in allowed or col_name == "*":
                            found = True
                            break

                if not found and tables_in_query:
                    return (
                        f"Error: Column '{col_name}' not found in any queried table "
                        f"({sorted(tables_in_query)})."
                    )

        return ""

    def _check_joins(self, stmt) -> str:
        alias_map = self._resolve_alias(stmt)

        for join in stmt.find_all(exp.Join):
            on_clause = join.args.get("on")

            if on_clause is None:
                continue

            for eq in on_clause.find_all(exp.EQ):
                left, right = eq.left, eq.right

                if not (isinstance(left, exp.Column) and isinstance(right, exp.Column)):
                    continue

                l_table = alias_map.get(
                    (left.table or "").lower(), (left.table or "").lower()
                )
                r_table = alias_map.get(
                    (right.table or "").lower(), (right.table or "").lower()
                )

                l_col = left.name.lower()
                r_col = right.name.lower()

                if not self._is_valid_join(l_table, l_col, r_table, r_col):
                    return (
                        f"Error: Attempted JOIN on '{l_table}.{l_col} = {r_table}.{r_col}'. "
                        f"No matching Foreign Key or Primary Key relationship found in schema."
                    )

        return ""

    def _is_valid_join(self, l_table: str, l_col: str, r_table: str, r_col: str) -> bool:
        # Check FK declared in l_table pointing to r_table
        if l_table in self.schema["tables"]:
            for fk in self.schema["tables"][l_table].get("foreign_keys", []):
                if (
                    fk["column"].lower() == l_col  # FIXED: Changed from "from_column"
                    and fk["references_table"].lower() == r_table
                    and fk["references_column"].lower() == r_col
                ):
                    return True

        # Check FK declared in r_table pointing to l_table (reverse)
        if r_table in self.schema["tables"]:
            for fk in self.schema["tables"][r_table].get("foreign_keys", []):
                if (
                    fk["column"].lower() == r_col  # FIXED: Changed from "from_column"
                    and fk["references_table"].lower() == l_table
                    and fk["references_column"].lower() == l_col
                ):
                    return True

        # Allow joining on matching PKs
        l_pks = [p.lower() for p in self.schema["tables"].get(l_table, {}).get("primary_keys", [])]
        r_pks = [p.lower() for p in self.schema["tables"].get(r_table, {}).get("primary_keys", [])]

        if l_col in r_pks and r_col in l_pks:
            return True

        return False