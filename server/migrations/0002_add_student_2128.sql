-- 기존 제약(최대 2127)을 확장합니다. 새 테이블에 모든 행을 복사한 뒤 교체합니다.
-- 기존 원본 migration은 수정하지 않습니다. D1 migration 트랜잭션 안에서 실행합니다.
CREATE TABLE students_v2 (
  id TEXT PRIMARY KEY CHECK (CAST(id AS INTEGER) BETWEEN 2101 AND 2128),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0)
);
INSERT INTO students_v2 SELECT id, total FROM students;
INSERT INTO students_v2(id) VALUES ('2128');
CREATE TABLE records_v2 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students_v2(id),
  note TEXT NOT NULL CHECK (length(note) <= 80),
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1))
);
INSERT INTO records_v2 SELECT seq, id, student_id, note, date, month, cancelled FROM records;
CREATE TABLE monthly_v2 (
  student_id TEXT NOT NULL REFERENCES students_v2(id),
  month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (student_id, month)
);
INSERT INTO monthly_v2 SELECT student_id, month, count FROM monthly;
DROP TRIGGER records_added;
DROP TRIGGER records_removed;
DROP TABLE records;
DROP TABLE monthly;
DROP TABLE students;
ALTER TABLE students_v2 RENAME TO students;
ALTER TABLE records_v2 RENAME TO records;
ALTER TABLE monthly_v2 RENAME TO monthly;
CREATE INDEX records_student_seq ON records(student_id, seq DESC) WHERE cancelled = 0;
CREATE TRIGGER records_added AFTER INSERT ON records BEGIN
  UPDATE students SET total = total + 1 WHERE id = NEW.student_id;
  INSERT INTO monthly(student_id, month, count) VALUES(NEW.student_id, NEW.month, 1)
  ON CONFLICT(student_id, month) DO UPDATE SET count = count + 1;
END;
CREATE TRIGGER records_removed AFTER UPDATE OF cancelled ON records
WHEN OLD.cancelled = 0 AND NEW.cancelled = 1 BEGIN
  UPDATE students SET total = total - 1 WHERE id = OLD.student_id;
  UPDATE monthly SET count = count - 1 WHERE student_id = OLD.student_id AND month = OLD.month;
END;
