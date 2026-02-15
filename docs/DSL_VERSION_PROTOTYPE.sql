-- Dataskyddslagen (2018:218) Version Tracking Prototype
--
-- Demonstrates how amendment tracking works for a statute with known amendment history.
-- DSL has been amended 6 times since enactment in 2018.

-- ============================================================================
-- MIGRATION: Add statute_amendments table
-- ============================================================================

CREATE TABLE statute_amendments (
  id INTEGER PRIMARY KEY,

  -- Target statute being amended
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,  -- NULL = entire statute affected

  -- Amending statute
  amended_by_sfs TEXT NOT NULL,
  amendment_date TEXT NOT NULL,

  -- Type of amendment
  amendment_type TEXT NOT NULL
    CHECK(amendment_type IN ('ändrad', 'ny_lydelse', 'införd', 'upphävd', 'ikraftträdande')),

  -- Version linkage
  version_before_id INTEGER REFERENCES legal_provision_versions(id),
  version_after_id INTEGER REFERENCES legal_provision_versions(id),

  -- Change metadata
  change_summary TEXT,
  amendment_section TEXT,

  UNIQUE(target_document_id, target_provision_ref, amended_by_sfs, amendment_date)
);

CREATE INDEX idx_amendments_target
  ON statute_amendments(target_document_id, target_provision_ref);
CREATE INDEX idx_amendments_date
  ON statute_amendments(amendment_date);
CREATE INDEX idx_amendments_amending_sfs
  ON statute_amendments(amended_by_sfs);

-- ============================================================================
-- SAMPLE DATA: DSL Amendment History
-- ============================================================================

-- Dataskyddslagen (2018:218) Timeline:
-- 2018-05-25: Original enactment
-- 2018-08-01: Amended by 2018:1248 (security provisions)
-- 2019-04-01: Amended by 2018:2002 (research provisions)
-- 2021-XX-XX: Amended by 2021:1174 (Defense/security exemptions)
-- 2022-XX-XX: Amended by 2022:444 (data breach reporting)
-- 2025-XX-XX: Amended by 2025:187 (law enforcement access)
-- 2025-XX-XX: Amended by 2025:256 (complaint handling procedures)

-- Amendment 1: 2018:1248 (Security provisions - 1 kap. 4 §)
INSERT INTO statute_amendments (
  target_document_id, target_provision_ref,
  amended_by_sfs, amendment_date,
  amendment_type, change_summary, amendment_section
) VALUES (
  '2018:218', '1:4',
  '2018:1248', '2018-08-01',
  'ändrad', 'Expanded exemptions for data breach reporting under security laws', '1 §'
);

-- Amendment 2: 2018:2002 (Research provisions - 4 kap. 3 §)
INSERT INTO statute_amendments (
  target_document_id, target_provision_ref,
  amended_by_sfs, amendment_date,
  amendment_type, change_summary, amendment_section
) VALUES (
  '2018:218', '4:3',
  '2018:2002', '2019-04-01',
  'ny_lydelse', 'New wording for research data processing vital interests exception', '1 §'
);

-- Amendment 3: 2021:1174 (Defense/security exemptions - 1 kap. 3 §)
INSERT INTO statute_amendments (
  target_document_id, target_provision_ref,
  amended_by_sfs, amendment_date,
  amendment_type, change_summary, amendment_section
) VALUES (
  '2018:218', '1:3',
  '2021:1174', '2021-12-01',
  'ändrad', 'Added exemptions for Defense Agency (1171) and Radio Agency (1172) data processing', '1 §'
);

-- Amendment 4: 2022:444 (Data breach reporting - 1 kap. 4 §)
INSERT INTO statute_amendments (
  target_document_id, target_provision_ref,
  amended_by_sfs, amendment_date,
  amendment_type, change_summary, amendment_section
) VALUES (
  '2018:218', '1:4',
  '2022:444', '2022-07-01',
  'ändrad', 'Clarified breach reporting exemptions under Security Protection Act', '1 §'
);

-- Amendment 5: 2025:187 (Law enforcement access - 2 kap. 5 §)
INSERT INTO statute_amendments (
  target_document_id, target_provision_ref,
  amended_by_sfs, amendment_date,
  amendment_type, change_summary, amendment_section
) VALUES (
  '2018:218', '2:5',
  '2025:187', '2025-01-15',
  'ändrad', 'Extended list of agencies that may request data disclosures (added Customs)', '1 §'
);

-- Amendment 6: 2025:256 (Complaint handling - 6 kap. 8 §, 7 kap. 3a §, 7 kap. 6 §)
INSERT INTO statute_amendments (
  target_document_id, target_provision_ref,
  amended_by_sfs, amendment_date,
  amendment_type, change_summary, amendment_section
) VALUES
  (
    '2018:218', '6:8',
    '2025:256', '2025-02-01',
    'ny_lydelse', 'New complaint response timeline procedures for DPA', '1 §'
  ),
  (
    '2018:218', '7:3 a',
    '2025:256', '2025-02-01',
    'införd', 'New provision: appeal rights for delayed DPA complaint handling', '2 §'
  ),
  (
    '2018:218', '7:6',
    '2025:256', '2025-02-01',
    'införd', 'New provision: court order for DPA to expedite complaint resolution', '3 §'
  );

-- ============================================================================
-- TIME-TRAVEL QUERIES: DSL 1:3 Version History
-- ============================================================================

-- Query 1: What did DSL 1:3 say on 2020-01-01? (Before 2021:1174 amendment)
SELECT
  provision_ref,
  content,
  valid_from,
  valid_to
FROM legal_provision_versions
WHERE document_id = '2018:218'
  AND provision_ref = '1:3'
  AND (valid_from IS NULL OR valid_from <= '2020-01-01')
  AND (valid_to IS NULL OR valid_to > '2020-01-01')
ORDER BY valid_from DESC
LIMIT 1;

-- Expected result (original 2018 text):
-- "Bestämmelserna i 2 § gäller inte i verksamhet som omfattas av lagen (2019:1182)
--  om Säkerhetspolisens behandling av personuppgifter."

-- Query 2: What did DSL 1:3 say on 2023-01-01? (After 2021:1174 amendment)
SELECT
  provision_ref,
  content,
  valid_from,
  valid_to
FROM legal_provision_versions
WHERE document_id = '2018:218'
  AND provision_ref = '1:3'
  AND (valid_from IS NULL OR valid_from <= '2023-01-01')
  AND (valid_to IS NULL OR valid_to > '2023-01-01')
ORDER BY valid_from DESC
LIMIT 1;

-- Expected result (amended text):
-- "Bestämmelserna i 2 § gäller inte i verksamhet som omfattas av
--  1. lagen (2021:1171) om behandling av personuppgifter vid Försvarsmakten,
--  2. lagen (2021:1172) om behandling av personuppgifter vid Försvarets radioanstalt, eller
--  3. lagen (2019:1182) om Säkerhetspolisens behandling av personuppgifter. Lag (2021:1174)."

-- ============================================================================
-- AMENDMENT CHAIN QUERY: Show all changes to DSL
-- ============================================================================

SELECT
  sa.target_provision_ref as provision,
  sa.amendment_date,
  sa.amended_by_sfs,
  sa.amendment_type,
  sa.change_summary,
  ld.title as amending_statute_title
FROM statute_amendments sa
LEFT JOIN legal_documents ld ON ld.id = sa.amended_by_sfs
WHERE sa.target_document_id = '2018:218'
ORDER BY sa.amendment_date, sa.target_provision_ref;

-- Expected output (6 rows):
-- provision | amendment_date | amended_by_sfs | amendment_type | change_summary
-- 1:4       | 2018-08-01     | 2018:1248      | ändrad         | Expanded exemptions...
-- 4:3       | 2019-04-01     | 2018:2002      | ny_lydelse     | New wording for research...
-- 1:3       | 2021-12-01     | 2021:1174      | ändrad         | Added exemptions for Defense...
-- 1:4       | 2022-07-01     | 2022:444       | ändrad         | Clarified breach reporting...
-- 2:5       | 2025-01-15     | 2025:187       | ändrad         | Extended list of agencies...
-- 6:8       | 2025-02-01     | 2025:256       | ny_lydelse     | New complaint response...
-- 7:3 a     | 2025-02-01     | 2025:256       | införd         | New provision: appeal rights...
-- 7:6       | 2025-02-01     | 2025:256       | införd         | New provision: court order...

-- ============================================================================
-- DIFF QUERY: What changed in DSL between 2020 and 2023?
-- ============================================================================

WITH v2020 AS (
  SELECT provision_ref, content
  FROM legal_provision_versions
  WHERE document_id = '2018:218'
    AND (valid_from IS NULL OR valid_from <= '2020-01-01')
    AND (valid_to IS NULL OR valid_to > '2020-01-01')
),
v2023 AS (
  SELECT provision_ref, content
  FROM legal_provision_versions
  WHERE document_id = '2018:218'
    AND (valid_from IS NULL OR valid_from <= '2023-01-01')
    AND (valid_to IS NULL OR valid_to > '2023-01-01')
)
SELECT
  v2020.provision_ref,
  v2020.content as content_2020,
  v2023.content as content_2023,
  sa.amendment_date,
  sa.amended_by_sfs,
  sa.change_summary
FROM v2020
JOIN v2023 ON v2020.provision_ref = v2023.provision_ref
LEFT JOIN statute_amendments sa
  ON sa.target_document_id = '2018:218'
  AND sa.target_provision_ref = v2020.provision_ref
  AND sa.amendment_date BETWEEN '2020-01-01' AND '2023-01-01'
WHERE v2020.content != v2023.content
ORDER BY v2020.provision_ref;

-- Expected output: provisions 1:3, 1:4 (amended by 2021:1174 and 2022:444)

-- ============================================================================
-- STATUTE-LEVEL QUERY: All statutes amended in 2021
-- ============================================================================

SELECT
  ld.id,
  ld.title,
  ld.short_name,
  COUNT(*) as amendment_count,
  GROUP_CONCAT(DISTINCT sa.amended_by_sfs) as amended_by
FROM statute_amendments sa
JOIN legal_documents ld ON sa.target_document_id = ld.id
WHERE sa.amendment_date LIKE '2021%'
GROUP BY sa.target_document_id
ORDER BY amendment_count DESC;

-- Expected output includes:
-- 2018:218 | Lag (2018:218) med kompletterande... | DSL | 1 | 2021:1174

-- ============================================================================
-- MCP TOOL IMPLEMENTATION EXAMPLE
-- ============================================================================

/*
Tool: get_provision_at_date

Parameters:
- sfs: string (e.g., "2018:218")
- provision_ref: string (e.g., "1:3")
- date: ISO date string (e.g., "2020-06-15")

Returns:
{
  "provision_ref": "1:3",
  "chapter": "1",
  "section": "3",
  "content": "Bestämmelserna i 2 § gäller inte...",
  "valid_from": "2018-05-25",
  "valid_to": "2021-12-01",
  "status": "historical",  // "historical" | "current"
  "amended_by": [
    {
      "sfs": "2021:1174",
      "date": "2021-12-01",
      "type": "ändrad",
      "summary": "Added exemptions for Defense Agency..."
    }
  ]
}

SQL Query:
*/

-- Implementation query template:
WITH target_version AS (
  SELECT
    id,
    provision_ref,
    chapter,
    section,
    title,
    content,
    valid_from,
    valid_to
  FROM legal_provision_versions
  WHERE document_id = ? -- bind: sfs
    AND provision_ref = ? -- bind: provision_ref
    AND (valid_from IS NULL OR valid_from <= ?) -- bind: date
    AND (valid_to IS NULL OR valid_to > ?) -- bind: date
  ORDER BY valid_from DESC
  LIMIT 1
)
SELECT
  tv.*,
  CASE
    WHEN tv.valid_to IS NULL THEN 'current'
    ELSE 'historical'
  END as status,
  json_group_array(
    json_object(
      'sfs', sa.amended_by_sfs,
      'date', sa.amendment_date,
      'type', sa.amendment_type,
      'summary', sa.change_summary
    )
  ) as amendments_json
FROM target_version tv
LEFT JOIN statute_amendments sa
  ON sa.target_document_id = ? -- bind: sfs
  AND sa.target_provision_ref = tv.provision_ref
  AND sa.amendment_date > tv.valid_from
GROUP BY tv.id;

-- ============================================================================
-- VALIDATION QUERIES
-- ============================================================================

-- Check 1: Every amendment references a real statute
SELECT sa.amended_by_sfs
FROM statute_amendments sa
LEFT JOIN legal_documents ld ON ld.id = sa.amended_by_sfs
WHERE ld.id IS NULL;
-- Should return 0 rows

-- Check 2: Amendment dates are after target statute enactment
SELECT
  sa.target_document_id,
  sa.amended_by_sfs,
  sa.amendment_date,
  ld.issued_date as target_issued
FROM statute_amendments sa
JOIN legal_documents ld ON ld.id = sa.target_document_id
WHERE sa.amendment_date < ld.issued_date;
-- Should return 0 rows

-- Check 3: Amendments have corresponding version records
SELECT
  sa.target_document_id,
  sa.target_provision_ref,
  sa.amendment_date,
  COUNT(v.id) as version_count
FROM statute_amendments sa
LEFT JOIN legal_provision_versions v
  ON v.document_id = sa.target_document_id
  AND v.provision_ref = sa.target_provision_ref
  AND v.valid_from = sa.amendment_date
GROUP BY sa.id
HAVING version_count = 0;
-- Should return 0 rows (unless amendment affects entire statute)
