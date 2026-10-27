import sys,json,sqlite3
payload=json.load(sys.stdin)
db=sqlite3.connect(sys.argv[1])
db.execute('PRAGMA foreign_keys = ON')
db.row_factory=sqlite3.Row
if 'schema' in payload:
    db.executescript(payload['schema'])
    db.commit()
    print('[]')
else:
    output=[]
    try:
        db.execute('BEGIN')
        for stmt in payload['statements']:
            before=db.total_changes
            cur=db.execute(stmt['sql'],stmt['args'])
            rows=[dict(r) for r in cur.fetchall()] if cur.description else []
            # D1 meta.changes covers direct row mutations; SELECT changes isn't used.
            output.append({'results':rows,'meta':{'changes':max(0,cur.rowcount)}})
        db.commit()
    except:
        db.rollback()
        raise
    print(json.dumps(output))
