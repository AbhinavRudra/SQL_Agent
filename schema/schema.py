import json
from pg_connector import engine
from sqlalchemy import text as sql_text

class SchemaExtractor:
    def __init__(self, db_engine):
        self.engine = db_engine
        self.schema_dict = {"tables": {}}

    def extract_base_columns(self):
        """Extracts all tables, columns, actual data types, and nullability."""
        query = sql_text("""
            SELECT table_name, column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'public';
        """)
        with self.engine.connect() as conn:
            result = conn.execute(query)
            for row in result.mappings():
                table = row["table_name"]
                col = row["column_name"]
                
                # Initialize table if not exists
                if table not in self.schema_dict["tables"]:
                    self.schema_dict["tables"][table] = {
                        "columns": {},
                        "primary_keys": [],
                        "foreign_keys": []
                    }
                
                # Add column details
                is_null = True if row["is_nullable"] == "YES" else False
                self.schema_dict["tables"][table]["columns"][col] = {
                    "type": row["data_type"],
                    "not_null": not is_null
                }

    def extract_primary_keys(self):
        """Identifies which columns are Primary Keys."""
        query = sql_text("""
            SELECT kcu.table_name, kcu.column_name 
            FROM information_schema.table_constraints tco
            JOIN information_schema.key_column_usage kcu 
              ON kcu.constraint_name = tco.constraint_name 
              AND kcu.constraint_schema = tco.constraint_schema
            WHERE tco.constraint_type = 'PRIMARY KEY' 
              AND tco.table_schema = 'public';
        """)
        with self.engine.connect() as conn:
            result = conn.execute(query)
            for row in result.mappings():
                table = row["table_name"]
                col = row["column_name"]
                if table in self.schema_dict["tables"]:
                    self.schema_dict["tables"][table]["primary_keys"].append(col)

    def extract_foreign_keys(self):
        """Extracts Foreign Keys WITH their target references."""
        query = sql_text("""
            SELECT
                tc.table_name AS table_name,
                kcu.column_name AS column_name,
                ccu.table_name AS references_table,
                ccu.column_name AS references_column
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND tc.table_schema = 'public';
        """)
        with self.engine.connect() as conn:
            result = conn.execute(query)
            for row in result.mappings():
                table = row["table_name"]
                fk_data = {
                    "column": row["column_name"],
                    "references_table": row["references_table"],
                    "references_column": row["references_column"]
                }
                if table in self.schema_dict["tables"]:
                    self.schema_dict["tables"][table]["foreign_keys"].append(fk_data)

    def export_to_json(self, output_path: str):
        """Dumps the final dictionary to a JSON file."""
        with open(output_path, 'w') as f:
            json.dump(self.schema_dict, f, indent=4)
        print(f"Success! Schema exported to {output_path}")

if __name__ == "__main__":
    print("Initializing Extractor...")
    extractor = SchemaExtractor(engine)
    
    print("Extracting columns and data types...")
    extractor.extract_base_columns()
    
    print("Extracting primary keys...")
    extractor.extract_primary_keys()
    
    print("Extracting foreign key mappings...")
    extractor.extract_foreign_keys()
    
    print("Writing to file...")
    extractor.export_to_json("schema_extracted_fixed.json")