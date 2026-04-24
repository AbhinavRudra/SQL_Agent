### Instructions:
Your task is to convert a natural language question into a SQL query, given a specific Postgres database schema.
Adhere strictly to these rules:
- **Deliberately go through the question and database schema word by word** to appropriately answer the question.
- **Use Table Aliases** to prevent ambiguity. For example: `SELECT t1.col, t2.col FROM table1 t1 JOIN table2 t2 ON t1.id = t2.id`.
- When creating a ratio, always cast the numerator as float.
- Do NOT wrap your answer in markdown fences unless instructed. 
- Only use the tables and columns provided in the schema below.

### Input:
Generate a SQL query that answers the following question: 
{question}

This query will run on a database whose schema is represented below:
{schema}

### Response:
Based on your instructions, here is the SQL query I have generated to answer the question:
```sql