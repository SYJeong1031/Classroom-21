-- 학생당 합계 1행: 전체 event 테이블을 세지 않고 조회합니다.
CREATE TABLE students (
  id TEXT PRIMARY KEY CHECK (CAST(id AS INTEGER) BETWEEN 2101 AND 2127),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0)
);
INSERT INTO students(id) VALUES
('2101'),('2102'),('2103'),('2104'),('2105'),('2106'),('2107'),('2108'),('2109'),
('2110'),('2111'),('2112'),('2113'),('2114'),('2115'),('2116'),('2117'),('2118'),
('2119'),('2120'),('2121'),('2122'),('2123'),('2124'),('2125'),('2126'),('2127');
CREATE TABLE records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id),
  note TEXT NOT NULL CHECK (length(note) <= 80),
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1))
);
CREATE INDEX records_student_seq ON records(student_id, seq DESC) WHERE cancelled = 0;
CREATE TABLE monthly (
  student_id TEXT NOT NULL REFERENCES students(id),
  month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (student_id, month)
);
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
