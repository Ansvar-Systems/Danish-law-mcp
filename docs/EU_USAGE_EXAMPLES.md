# EU Law Integration — Usage Examples

> Real-world scenarios demonstrating Swedish ↔ EU legal cross-referencing

## Table of Contents

1. [Data Protection Lawyer](#scenario-1-data-protection-lawyer)
2. [Procurement Officer](#scenario-2-procurement-officer)
3. [Academic Researcher](#scenario-3-academic-researcher)
4. [Corporate Compliance](#scenario-4-corporate-compliance)
5. [Tax Advisor](#scenario-5-tax-advisor)
6. [Environmental Consultant](#scenario-6-environmental-consultant)

---

## Scenario 1: Data Protection Lawyer

**Context:** Law firm representing client in GDPR compliance dispute. Need to understand Swedish implementation of GDPR consent requirements.

### Question 1: What EU law does DSL implement?

**MCP Tool Call:**
```json
{
  "tool": "get_eu_basis",
  "arguments": {
    "sfs_number": "2018:218",
    "include_articles": true
  }
}
```

**Expected Output:**
```json
{
  "statute": {
    "sfs_number": "2018:218",
    "title": "Dataskyddslagen (DSL)",
    "status": "in_force",
    "in_force_date": "2018-05-25"
  },
  "eu_documents": [
    {
      "id": "regulation:2016/679",
      "type": "regulation",
      "year": 2016,
      "number": 679,
      "community": "EU",
      "celex_number": "32016R0679",
      "short_name": "GDPR",
      "title": "General Data Protection Regulation",
      "reference_type": "supplements",
      "is_primary_implementation": true,
      "articles": ["6.1", "7", "9.2", "13-15", "35", "77", "79"]
    }
  ],
  "total_references": 1,
  "_metadata": {
    "source": "Swedish statute text (SFS 2018:218)",
    "extraction_method": "Automated parser",
    "verified": true
  }
}
```

**Interpretation:**
- DSL is the **primary** Swedish implementation of GDPR
- DSL **supplements** GDPR (regulation already applies directly)
- Key articles cited: 6.1 (legal basis), 7 (consent conditions), 9.2 (sensitive data), 13-15 (transparency), 35 (DPIA), 77 (complaints), 79 (remedies)

---

### Question 2: What does DSL 3 kap. 5 § say about consent?

**MCP Tool Call:**
```json
{
  "tool": "get_provision",
  "arguments": {
    "sfs_number": "2018:218",
    "chapter": "3",
    "section": "5"
  }
}
```

**Expected Output:**
```json
{
  "provision": {
    "sfs_number": "2018:218",
    "provision_ref": "3:5",
    "chapter": "3",
    "section": "5",
    "title": "Laglig grund för behandling av personuppgifter",
    "content": "Personuppgifter får behandlas bara om... [full text]"
  }
}
```

---

### Question 3: What EU article does DSL 3:5 implement?

**MCP Tool Call:**
```json
{
  "tool": "get_provision_eu_basis",
  "arguments": {
    "sfs_number": "2018:218",
    "chapter": "3",
    "section": "5"
  }
}
```

**Expected Output:**
```json
{
  "provision": {
    "sfs_number": "2018:218",
    "provision_ref": "3:5",
    "title": "Laglig grund för behandling av personuppgifter"
  },
  "eu_references": [
    {
      "eu_document_id": "regulation:2016/679",
      "short_name": "GDPR",
      "articles": ["6.1.a", "6.1.c"],
      "reference_type": "cites_article",
      "context": "Denna paragraf kompletterar artikel 6.1 i Europaparlamentets och rådets förordning (EU) 2016/679..."
    }
  ]
}
```

**Interpretation:**
- DSL 3:5 directly references **GDPR Article 6.1.a** (consent) and **6.1.c** (legal obligation)
- Swedish law "supplements" (kompletterar) the EU regulation

---

### Question 4: What was the government's reasoning?

**MCP Tool Call:**
```json
{
  "tool": "get_preparatory_works",
  "arguments": {
    "sfs_number": "2018:218"
  }
}
```

**Expected Output:**
```json
{
  "statute": {
    "sfs_number": "2018:218",
    "title": "Dataskyddslagen"
  },
  "preparatory_works": [
    {
      "id": "prop_2017_18_105",
      "type": "proposition",
      "title": "Ny dataskyddslag",
      "issued_date": "2018-02-01",
      "url": "https://www.riksdagen.se/sv/dokument-lagar/dokument/proposition/ny-dataskyddslag_H503105"
    }
  ]
}
```

**Follow-up:** Read Prop. 2017/18:105 to understand Swedish implementation choices (not included in MCP, external research needed).

---

### Question 5: Any case law on consent requirements?

**MCP Tool Call:**
```json
{
  "tool": "search_case_law",
  "arguments": {
    "query": "samtycke personuppgifter GDPR",
    "court": "HFD",
    "start_date": "2018-05-25"
  }
}
```

**Expected Output:**
```json
{
  "results": [
    {
      "id": "hfd-2020-ref-45",
      "court": "HFD",
      "date": "2020-09-15",
      "summary": "Mål om samtycke till personuppgiftsbehandling...",
      "cited_statutes": ["2018:218"]
    }
  ],
  "total": 1
}
```

---

### Complete Legal Research Package

**Combine all sources:**
```json
{
  "tool": "build_legal_stance",
  "arguments": {
    "query": "GDPR consent requirements Swedish law",
    "include_sources": ["legislation", "case_law", "preparatory_works"]
  }
}
```

**Result:** Comprehensive report with DSL provisions, GDPR basis, HFD case law, and Prop. 2017/18:105.

---

## Scenario 2: Procurement Officer

**Context:** Municipality planning procurement, needs to verify compliance with EU procurement directives.

### Question 1: Which EU directives govern Swedish procurement?

**MCP Tool Call:**
```json
{
  "tool": "search_eu_implementations",
  "arguments": {
    "query": "procurement",
    "type": "directive"
  }
}
```

**Expected Output:**
```json
{
  "results": [
    {
      "id": "directive:2014/24",
      "type": "directive",
      "year": 2014,
      "number": 24,
      "celex_number": "32014L0024",
      "title": "Public procurement directive",
      "swedish_implementations": 1
    },
    {
      "id": "directive:2014/25",
      "type": "directive",
      "year": 2014,
      "number": 25,
      "celex_number": "32014L0025",
      "title": "Procurement by entities in water, energy, transport and postal services",
      "swedish_implementations": 1
    }
  ],
  "total_results": 2
}
```

---

### Question 2: Which Swedish law implements the public procurement directive?

**MCP Tool Call:**
```json
{
  "tool": "get_swedish_implementations",
  "arguments": {
    "eu_document_id": "directive:2014/24",
    "in_force_only": true
  }
}
```

**Expected Output:**
```json
{
  "eu_document": {
    "id": "directive:2014/24",
    "type": "directive",
    "celex_number": "32014L0024",
    "title": "Public procurement directive"
  },
  "implementations": [
    {
      "sfs_number": "2016:1145",
      "title": "Lag om offentlig upphandling (LOU)",
      "status": "in_force",
      "is_primary": true,
      "reference_type": "implements",
      "in_force_date": "2017-01-01"
    }
  ],
  "total_implementations": 1
}
```

**Interpretation:**
- Swedish procurement is governed by **LOU (2016:1145)**
- LOU implements **Directive 2014/24/EU**
- Law entered force **2017-01-01** (before directive's deadline)

---

### Question 3: Is LOU still current?

**MCP Tool Call:**
```json
{
  "tool": "check_currency",
  "arguments": {
    "sfs_number": "2016:1145"
  }
}
```

**Expected Output:**
```json
{
  "statute": {
    "sfs_number": "2016:1145",
    "title": "Lag om offentlig upphandling",
    "status": "in_force",
    "in_force_date": "2017-01-01",
    "amendments": [
      "2019:742",
      "2020:1010"
    ]
  },
  "is_current": true,
  "last_updated": "2020-12-01"
}
```

**Interpretation:**
- LOU is **current** and in force
- Has been amended twice (2019, 2020)
- Safe to use for 2025 procurement planning

---

## Scenario 3: Academic Researcher

**Context:** PhD student studying Swedish environmental law's relationship with EU regulations.

### Question 1: How much EU law is in Miljöbalken?

**MCP Tool Call:**
```json
{
  "tool": "get_eu_basis",
  "arguments": {
    "sfs_number": "1998:808"
  }
}
```

**Expected Output:**
```json
{
  "statute": {
    "sfs_number": "1998:808",
    "title": "Miljöbalken"
  },
  "eu_documents": [
    {
      "id": "regulation:1907/2006",
      "short_name": "REACH",
      "reference_type": "applies"
    },
    {
      "id": "directive:2010/75",
      "short_name": "IED",
      "reference_type": "implements"
    },
    {
      "id": "directive:2008/98",
      "short_name": "Waste Framework Directive",
      "reference_type": "implements"
    }
    // ... 68 more EU references
  ],
  "total_references": 71
}
```

**Interpretation:**
- Miljöbalken has **71 EU references** (most of any Swedish statute)
- Mix of regulations (apply directly) and directives (implemented)
- Covers chemicals (REACH), industrial emissions (IED), waste, water, air quality

---

### Question 2: Which Swedish laws implement REACH?

**MCP Tool Call:**
```json
{
  "tool": "get_swedish_implementations",
  "arguments": {
    "eu_document_id": "regulation:1907/2006"
  }
}
```

**Expected Output:**
```json
{
  "eu_document": {
    "id": "regulation:1907/2006",
    "short_name": "REACH",
    "type": "regulation"
  },
  "implementations": [
    {
      "sfs_number": "1998:808",
      "title": "Miljöbalken",
      "is_primary": true,
      "reference_type": "applies"
    },
    {
      "sfs_number": "2008:245",
      "title": "Lag om kemikalier",
      "is_primary": false,
      "reference_type": "supplements"
    }
  ],
  "total_implementations": 2
}
```

**Research insight:** REACH is an EU **regulation** (directly applicable), but Sweden has both Miljöbalken and a specific chemicals law referencing it.

---

### Question 3: Compare EU influence across legal domains

**Batch Query (hypothetical):**
```javascript
const statutes = [
  "1998:808", // Environmental (Miljöbalken)
  "2018:218", // Data protection (DSL)
  "2005:551", // Company law (Aktiebolagslagen)
  "1977:1160" // Labor safety (Arbetsmiljölagen)
];

for (const sfs of statutes) {
  const result = await getEUBasis(sfs);
  console.log(`${sfs}: ${result.total_references} EU references`);
}
```

**Output:**
```
1998:808: 71 EU references (Environmental)
2018:218: 1 EU reference (Data protection)
2005:551: 35 EU references (Company law)
1977:1160: 33 EU references (Labor safety)
```

**Research conclusion:** Environmental and company law are **heavily Europeanized**, while data protection (GDPR) is a single comprehensive regulation.

---

## Scenario 4: Corporate Compliance

**Context:** Multinational corporation ensuring Swedish subsidiary complies with EU financial reporting directives.

### Question 1: Which EU directives govern Swedish annual reports?

**MCP Tool Call:**
```json
{
  "tool": "get_eu_basis",
  "arguments": {
    "sfs_number": "1995:1554"
  }
}
```

**Expected Output:**
```json
{
  "statute": {
    "sfs_number": "1995:1554",
    "title": "Årsredovisningslagen (ÅRL)"
  },
  "eu_documents": [
    {
      "id": "directive:2013/34",
      "short_name": "Accounting Directive",
      "reference_type": "implements",
      "is_primary": true
    },
    {
      "id": "directive:2006/43",
      "short_name": "Statutory Audit Directive",
      "reference_type": "implements"
    }
    // ... 43 more references
  ],
  "total_references": 45
}
```

---

### Question 2: Verify audit requirements

**MCP Tool Call:**
```json
{
  "tool": "get_swedish_implementations",
  "arguments": {
    "eu_document_id": "directive:2006/43",
    "in_force_only": true
  }
}
```

**Expected Output:**
```json
{
  "implementations": [
    {
      "sfs_number": "1995:1554",
      "title": "Årsredovisningslagen",
      "is_primary": false
    },
    {
      "sfs_number": "2001:883",
      "title": "Revisorslagen",
      "is_primary": true
    }
  ]
}
```

**Compliance action:** Review both **ÅRL** (reporting) and **Revisorslagen** (auditor requirements).

---

## Scenario 5: Tax Advisor

**Context:** Advising on Swedish tax law's compliance with EU tax transparency directives (DAC6).

### Question 1: Does Swedish tax law implement DAC6?

**MCP Tool Call:**
```json
{
  "tool": "search_eu_implementations",
  "arguments": {
    "query": "tax transparency DAC6",
    "type": "directive",
    "year_from": 2018
  }
}
```

**Expected Output:**
```json
{
  "results": [
    {
      "id": "directive:2018/822",
      "short_name": "DAC6",
      "title": "Mandatory disclosure of cross-border tax arrangements",
      "swedish_implementations": 1
    }
  ]
}
```

---

### Question 2: Which Swedish law implements DAC6?

**MCP Tool Call:**
```json
{
  "tool": "get_swedish_implementations",
  "arguments": {
    "eu_document_id": "directive:2018/822"
  }
}
```

**Expected Output:**
```json
{
  "implementations": [
    {
      "sfs_number": "2011:1244",
      "title": "Skatteförfarandelagen",
      "is_primary": true,
      "reference_type": "implements",
      "in_force_date": "2020-07-01"
    }
  ]
}
```

**Compliance insight:** DAC6 is implemented in **Skatteförfarandelagen** (tax procedure law), effective 2020-07-01.

---

### Question 3: Any related case law?

**MCP Tool Call:**
```json
{
  "tool": "search_case_law",
  "arguments": {
    "query": "skatteuppgifter gränsöverskridande rapportering",
    "court": "HFD",
    "start_date": "2020-07-01"
  }
}
```

**Expected Output:**
```json
{
  "results": [
    {
      "id": "hfd-2022-ref-12",
      "summary": "Mål om rapportering av gränsöverskridande skatteupplägg...",
      "cited_statutes": ["2011:1244"]
    }
  ]
}
```

---

## Scenario 6: Environmental Consultant

**Context:** Environmental consultancy advising client on EU chemical regulations (REACH) compliance.

### Question 1: How does REACH apply in Sweden?

**MCP Tool Call:**
```json
{
  "tool": "get_swedish_implementations",
  "arguments": {
    "eu_document_id": "regulation:1907/2006",
    "in_force_only": true
  }
}
```

**Expected Output:**
```json
{
  "eu_document": {
    "id": "regulation:1907/2006",
    "short_name": "REACH",
    "type": "regulation",
    "title": "Registration, Evaluation, Authorisation of Chemicals"
  },
  "implementations": [
    {
      "sfs_number": "1998:808",
      "title": "Miljöbalken",
      "reference_type": "applies",
      "is_primary": true
    }
  ]
}
```

**Interpretation:**
- REACH is an EU **regulation** (directly applicable, no transposition needed)
- Miljöbalken **references** REACH but doesn't implement it
- Client must comply with REACH directly + Swedish environmental law

---

### Question 2: Find relevant Miljöbalken provisions

**MCP Tool Call:**
```json
{
  "tool": "search_legislation",
  "arguments": {
    "query": "kemikalier farliga ämnen REACH",
    "document_id": "1998:808"
  }
}
```

**Expected Output:**
```json
{
  "results": [
    {
      "sfs_number": "1998:808",
      "provision_ref": "14:2",
      "content": "Kemiska produkter och bioteknik...REACH..."
    }
  ]
}
```

---

### Question 3: Build complete compliance picture

**MCP Tool Call:**
```json
{
  "tool": "build_legal_stance",
  "arguments": {
    "query": "chemical substances regulation Sweden",
    "include_sources": ["legislation", "case_law"]
  }
}
```

**Expected Output:**
```json
{
  "legislation": [
    {
      "sfs_number": "1998:808",
      "title": "Miljöbalken",
      "provisions": ["14:2", "14:5"]
    }
  ],
  "eu_basis": [
    {
      "id": "regulation:1907/2006",
      "short_name": "REACH"
    }
  ],
  "case_law": [
    {
      "court": "MÖD",
      "summary": "Tillstånd för hantering av kemikalier..."
    }
  ]
}
```

**Compliance recommendation:** Client must comply with **both** REACH (EU regulation) **and** Miljöbalken (Swedish supplementary requirements).

---

## Interpretation Guidelines

### Reference Types

When you see these reference types, interpret as follows:

| Reference Type | Meaning | Action |
|----------------|---------|--------|
| `implements` | Swedish law implements EU directive | Check both Swedish law AND EU directive |
| `supplements` | Swedish law supplements EU regulation | EU regulation applies + Swedish additions |
| `applies` | EU regulation applies directly | Primary compliance is with EU law |
| `cites_article` | References specific EU article | Check exact EU article for requirements |
| `complies_with` | Ensures EU compliance | Swedish law designed for EU compatibility |

### Common Pitfalls

1. **Assuming "implements" means EU directive doesn't apply**
   - Incorrect: Directive requirements still apply, Swedish law just transposes them
   - Correct: Check both Swedish implementation AND EU directive text

2. **Ignoring EU regulations because Swedish law exists**
   - Incorrect: EU regulations apply **directly**, Swedish law only supplements
   - Correct: Primary compliance is with EU regulation (e.g., GDPR)

3. **Not checking for amendments**
   - Incorrect: Assuming old EU directive still in force
   - Correct: Use `check_currency` or EUR-Lex to verify current status

4. **Confusing CELEX numbers**
   - Incorrect: "32016R0679" is just a complicated ID
   - Correct: CELEX = official EUR-Lex identifier for precise lookup

---

## Best Practices

### For Legal Professionals

1. **Start broad, narrow down:**
   - `search_eu_implementations` → `get_swedish_implementations` → `get_provision_eu_basis`

2. **Verify critical citations:**
   - Use CELEX numbers to look up EU law on EUR-Lex
   - Cross-check with preparatory works for Swedish implementation choices

3. **Check currency:**
   - Always use `check_currency` for statutes
   - Verify EU directive hasn't been amended (EUR-Lex)

4. **Combine sources:**
   - Use `build_legal_stance` for comprehensive research
   - Include case law and preparatory works

### For Researchers

1. **Quantitative analysis:**
   - Count EU references per statute for Europeanization metrics
   - Compare reference types across legal domains

2. **Historical comparison:**
   - Check repealed Swedish laws (e.g., PUL → DSL)
   - Track when Swedish law updated to reflect EU changes

3. **Citation networks:**
   - Map EU acts → Swedish statutes → case law
   - Identify highly-referenced EU acts (GDPR, eIDAS)

### For Compliance Officers

1. **Dual compliance:**
   - For EU regulations: comply with EU law + Swedish supplements
   - For EU directives: comply with Swedish implementation

2. **Amendment monitoring:**
   - Subscribe to EUR-Lex notifications for relevant EU acts
   - Check Swedish statute amendments quarterly

3. **Documentation:**
   - Keep CELEX numbers in compliance documentation
   - Link to both Swedish law and EU law sources

---

## Additional Resources

- **EUR-Lex:** https://eur-lex.europa.eu/ (official EU law database)
- **Riksdagen EU Info:** https://www.riksdagen.se/sv/eu-information/
- **Swedish Government EU Policy:** https://www.regeringen.se/regeringens-politik/eu/

---

**Last updated:** 2025-02-12
**Version:** 1.1.0 (EU Integration)
