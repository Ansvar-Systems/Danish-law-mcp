# Coverage Limitations

This document details what legal sources are **NOT** included in this Tool and the impact on legal research completeness.

---

## Executive Summary

⚠️ **This Tool is Incomplete** — Critical legal sources are missing.

**Major Gaps:**
1. 🇪🇺 **EU Regulations and Directives** — Swedish law increasingly implements EU law
2. ⚖️ **CJEU Case Law** — Court of Justice of the European Union (binding on Swedish courts)
3. 📜 **Historical Statute Versions** — Limited availability of provision wording over time
4. 📚 **Legal Commentary** — No annotations, academic commentary, or practice guides
5. 🏛️ **Lower Court Decisions** — District and appellate courts largely missing
6. 📋 **Preparatory Works** — Limited coverage of propositioner and SOUs

**Impact**: Professional legal research using this Tool **will miss critical authorities** and must be supplemented with additional sources.

---

## 1. EU Law (Critical Gap)

### What's Missing

#### EU Regulations

**Examples:**
- **GDPR** (Regulation (EU) 2016/679) — Data protection
- **Digital Services Act** (Regulation (EU) 2022/2065) — Online platform liability
- **Markets in Crypto-Assets** (MiCA) (Regulation (EU) 2023/1114) — Cryptocurrency regulation
- **AI Act** (Regulation (EU) 2024/1689) — Artificial intelligence regulation

**Status in This Tool**: ❌ **Not Included**

**Why It Matters:**
- EU Regulations are **directly applicable** in Sweden (no transposition required)
- Supremacy clause — EU law overrides conflicting Swedish law
- Swedish courts must apply EU Regulations alongside Swedish statutes

#### EU Directives

**Examples:**
- **Whistleblower Protection Directive** (Directive (EU) 2019/1937)
- **Copyright in the Digital Single Market** (Directive (EU) 2019/790)
- **Shareholder Rights Directive II** (Directive (EU) 2017/828)

**Status in This Tool**: ❌ **Not Included**

**Why It Matters:**
- Sweden transposes Directives into national law (often visible in Swedish statutes)
- Need EU Directive text to understand legislative intent and interpretation
- CJEU interprets Directives — binding on Swedish courts

#### CJEU Case Law

**Court**: Court of Justice of the European Union (Luxembourg)

**Examples:**
- *Google Spain* (C-131/12) — Right to be forgotten (GDPR)
- *Schrems II* (C-311/18) — International data transfers
- *Viking Line* (C-438/05) — Freedom of establishment vs. labor rights
- *Åklagaren v. Hans Åkerberg Fransson* (C-617/10) — Ne bis in idem principle

**Status in This Tool**: ❌ **Not Included**

**Why It Matters:**
- CJEU decisions are **binding** on Swedish courts
- Supremacy and direct effect — CJEU interpretation prevails over national law
- Swedish law must be interpreted consistently with CJEU precedent

---

### Impact on Swedish Law Interpretation

**Problem**: Swedish law is increasingly **enmeshed with EU law**. Researching Swedish GDPR implementation (2018:218) without access to:
- EU GDPR text
- CJEU data protection case law
- European Data Protection Board (EDPB) guidelines

...results in **incomplete and potentially incorrect legal analysis**.

**Example Scenario:**

A lawyer searches this Tool for "data breach notification requirements" and finds:

```
Dataskyddslagen (2018:218) 3 kap. 5 §
"En personuppgiftsansvarig ska anmäla en personuppgiftsincident till tillsynsmyndigheten..."
```

**What's Missing:**
- GDPR Article 33 (source of Swedish provision)
- CJEU cases interpreting "without undue delay"
- EDPB guidelines on notification scope
- Article 29 Working Party opinions

Without these sources, the lawyer may:
- Miss CJEU case law limiting Swedish provision's scope
- Incorrectly apply Swedish law where GDPR directly applies
- Fail to advise on cross-border notification obligations under GDPR

---

### Workaround

**Use Companion MCP Server:**

```json
{
  "mcpServers": {
    "swedish-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/swedish-law-mcp"]
    },
    "eu-regulations": {
      "command": "npx",
      "args": ["-y", "@ansvar/eu-regulations-mcp"]
    }
  }
}
```

**[@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)**: Companion server covering:
- EU Regulations and Directives
- CJEU case law (via EUR-Lex)
- EDPB guidelines and opinions
- European Commission guidance

**Combined Coverage**: Swedish law + EU law = more complete legal research

---

## 2. Historical Statute Versions (Significant Gap)

### What's Missing

**Historical Provision Wording**: Provisions as they existed on specific dates in the past.

**Example:**
- **Current (2026)**: Dataskyddslagen 2018:218 has been amended 5 times
- **Historical (2020)**: What did Chapter 3, Section 5 say on 2020-06-15?

**Status in This Tool**:
- ⚠️ **Limited**: Some historical versions in `legal_provision_versions` table
- ❌ **Incomplete**: Not all amendments tracked
- ❌ **No Systematic Coverage**: Depends on manual ingestion of amendments

---

### Why Historical Versions Matter

#### Transitional Law Issues

**Scenario**: Contract signed in 2019 references Dataskyddslagen. Dispute arises in 2026.

**Question**: Which version of Dataskyddslagen applies — 2019 or 2026?

**Answer Depends On**:
- Transitional provisions in amending statute
- Lex posterior vs. lex specialis rules
- Contract interpretation principles (law at time of signing)

**This Tool Cannot Reliably Answer** without comprehensive historical version tracking.

---

#### Legal History Research

**Use Cases:**
- Academic research on legislative evolution
- Constitutional law challenges (was provision valid when enacted?)
- Human rights litigation (compliance with ECHR at time of events)

**Current Limitation**: Tool focuses on **current law**, not legal history.

---

### Workaround

**For Professional Use**:
- **Karnov**: Comprehensive historical versions with annotations
- **Riksdagen**: Query by publication date for original SFS text
- **Manual Research**: SFS archive at universities and law libraries

**For This Tool (Future Enhancement)**:
- Ingest all SFS amendments systematically
- Build provision version graph (valid_from, valid_to)
- Support `as_of_date` queries across all statutes

---

## 3. Legal Commentary and Annotations (Critical for Professional Use)

### What's Missing

**Doctrinal Commentary**:
- Academic articles and treatises
- Practitioner guides and handbooks
- Editorial annotations explaining application

**Practice Notes**:
- Precedent analysis ("this provision has been applied in X contexts")
- Drafting tips ("when citing this provision, note Y exception")
- Cross-references to related provisions and preparatory works

**Status in This Tool**: ❌ **Not Included** — Plain statutory text and case summaries only

---

### Why Commentary Matters

**Statutory Text is Ambiguous**: Swedish law, like all law, requires interpretation.

**Example**: Dataskyddslagen 2018:218, 3 kap. 5 §

> "En personuppgiftsansvarig ska anmäla en personuppgiftsincident till tillsynsmyndigheten **utan onödigt dröjsmål**..."

**Question**: What is "utan onödigt dröjsmål" (without undue delay)?

**Answers Require Commentary**:
- Integritetsskyddsmyndigheten (IMY) guidance: 72 hours in practice
- CJEU case law on "without undue delay" under GDPR Article 33
- Academic debate on Swedish vs. GDPR standard
- Practitioner experience from enforcement actions

**This Tool Provides**: Raw statute text
**Professional Research Requires**: Commentary explaining "72-hour rule" and IMY practice

---

### Workaround

**Commercial Databases**:
- **Karnov**: Extensive annotations by legal experts
- **Juno**: Practice notes and commentary
- **Zeteo**: Academic literature integration

**Academic Resources**:
- **Juridisk Tidskrift (JT)**: Leading Swedish law journal
- **Svensk Juristtidning (SvJT)**: Academic commentary
- University library databases (JSTOR, HeinOnline)

---

## 4. Lower Court Decisions (Major Gap in Case Law)

### What's Missing

**Courts NOT Comprehensively Covered**:
- **Tingsrätter** (District Courts) — Trial-level decisions
- **Hovrätter** (Courts of Appeal) — Appellate decisions
- **Förvaltningsrätter** (Administrative Courts) — First-instance admin law
- **Kammarrätter** (Administrative Courts of Appeal)

**Status in This Tool**:
- ✅ **Good Coverage**: Supreme courts (HD, HFD)
- ⚠️ **Partial Coverage**: Some appellate court decisions (via lagen.nu)
- ❌ **Poor Coverage**: District and administrative courts

---

### Why Lower Courts Matter

#### Precedential Value

While Swedish law is not strictly bound by stare decisis, lower court decisions:
- Indicate judicial trends and reasoning patterns
- Fill gaps where Supreme Court has not ruled
- Provide practical examples of statutory application
- Show how trial courts interpret ambiguous provisions

---

#### Volume of Law Practice

**Statistical Reality**:
- **99% of cases** are decided by lower courts (never reach HD/HFD)
- **Practitioners need** to know how Tingsrätt judges interpret statutes
- **Supreme Court cases** are rare and may not address common issues

**This Tool's Bias**: Skewed toward Supreme Court decisions, missing the **bulk of judicial practice**.

---

### Workaround

**Official Sources**:
- **Domstol.se**: Individual court websites publish selected decisions
- **InfoTorg Juridik**: Commercial database with lower court decisions

**Practical Research**:
- Contact clerks at relevant Tingsrätt/Hovrätt
- Freedom of Information requests (offentlighetsprincipen) for specific cases

---

## 5. Preparatory Works (Significant Gap)

### What's Missing

**Förarbeten (Preparatory Works)**:
- **Propositioner** (Government Bills) — Detailed legislative intent and commentary
- **SOU** (Statens offentliga utredningar) — Official government investigations
- **Ds** (Departementsserier) — Departmental memoranda

**Status in This Tool**:
- ⚠️ **Limited**: Some preparatory works linked in `preparatory_works` table
- ❌ **Not Comprehensive**: Only manually ingested works included
- ❌ **No Full Text**: Summaries only, not full proposition/SOU text

---

### Why Förarbeten Matter

**Swedish Legal Method**: Statutory interpretation heavily relies on förarbeten.

**Hierarchy of Interpretation**:
1. Statutory text (ordalydelsen)
2. **Förarbeten** — Legislative history and intent
3. Systematic interpretation (systematiken)
4. Teleological interpretation (ändamålet)

**Förarbeten are authoritative** for understanding ambiguous provisions.

**Example**: Dataskyddslagen 2018:218

**Question**: Does "personuppgiftsansvarig" include small non-profits?

**Answer Found In**: Prop. 2017/18:105, p. 152 (Government Bill)
> "Även små ideella föreningar omfattas av ansvarsbegreppet om de behandlar personuppgifter..."

**This Tool**: ❌ Does not include Prop. 2017/18:105 full text

---

### Workaround

**Official Source**:
- **Riksdagen.se**: Full-text propositioner and SOUs freely available
- **Lagrummet.se**: Links to preparatory works for each statute

**Commercial Databases**:
- **Karnov/Juno**: Indexed and searchable preparatory works with cross-references

**This Tool (Future Enhancement)**:
- Ingest full-text propositioner via Riksdagen API
- Link provisions to specific paragraphs in förarbeten
- Full-text search across preparatory works

---

## 6. Administrative Regulations (Förordningar)

### What's Missing

**Subordinate Legislation**:
- **Förordningar** — Government regulations implementing statutes
- **Myndighetsföreskrifter** — Agency regulations (e.g., IMY guidelines)
- **EU Implementing Acts** — Commission regulations

**Status in This Tool**: ❌ **Not Included**

---

### Why Förordningar Matter

**Statutory Delegation**: Statutes often delegate details to förordningar.

**Example**: Dataskyddslagen 2018:218, 7 kap. 1 §

> "Regeringen eller den myndighet som regeringen bestämmer får meddela **föreskrifter om böter**..."

**Implementation**: Dataskyddsförordningen (2018:219) — Government regulation

**This Tool Has**: Dataskyddslagen (statute)
**This Tool Missing**: Dataskyddsförordningen (implementing regulation with penalty details)

**Result**: Incomplete picture of data protection law without förordningar.

---

### Workaround

**Official Sources**:
- **Riksdagen.se**: SFS archive includes förordningar
- **Lagrummet.se**: Links to related förordningar
- **Agency websites**: Myndighetsföreskrifter published by Integritetsskyddsmyndigheten, Finansinspektionen, etc.

**This Tool (Future Enhancement)**:
- Ingest förordningar alongside statutes
- Link statutes to implementing regulations
- Include agency guidelines and interpretive rules

---

## 7. International Treaties and Conventions

### What's Missing

**Treaties Sweden Has Ratified**:
- **ECHR** (European Convention on Human Rights)
- **ICCPR** (International Covenant on Civil and Political Rights)
- **Geneva Conventions** (International humanitarian law)
- **Bilateral investment treaties** (BITs)

**Status in This Tool**: ❌ **Not Included**

---

### Why Treaties Matter

**Constitutional Incorporation**: Sweden is **dualist** — treaties must be incorporated into Swedish law.

**But**: ECtHR (European Court of Human Rights) case law heavily influences Swedish courts.

**Example**: ECHR Article 8 (right to privacy)
- Incorporated via Europakonventionen (1994:1219)
- ECtHR case law binding on Swedish courts
- Influences interpretation of Swedish privacy laws

**This Tool**: ❌ Does not include Europakonventionen or ECtHR case law

---

### Workaround

**Official Sources**:
- **ECHR**: https://www.echr.coe.int/
- **HUDOC**: ECtHR case law database
- **UN Treaty Collection**: International human rights treaties

**Commercial Databases**:
- **Karnov/Juno**: Include ECHR and other key treaties

---

## 8. Legal Definitions and Terminology

### What's Missing

**Legal Dictionary**:
- Swedish-English legal terms
- Definitions of juridiska termer (legal terms of art)
- Cross-references between concepts

**Status in This Tool**: ⚠️ **Limited** — Some definitions in `definitions` table, but not comprehensive

---

### Why Definitions Matter

**Example**: "God man" vs. "Förvaltare"

**Question**: What's the difference?

**This Tool**: May find statutes mentioning both, but no definitional guidance

**Professional Databases**: Include legal dictionaries explaining distinction:
- **God man**: Guardian for person who can manage some affairs
- **Förvaltare**: Administrator for person incapable of managing own affairs

---

### Workaround

**Resources**:
- **Norstedts Juridiska Ordbok**: Swedish-English legal dictionary
- **Karnov**: Built-in legal glossary
- **Zeteo**: Terminology search across sources

**This Tool (Future Enhancement)**:
- Expand `definitions` table systematically
- Link definitions to provisions where terms are used
- Swedish-English terminology mapping

---

## Coverage Summary Matrix

| Legal Source | Coverage | Impact on Professional Use | Workaround |
|--------------|----------|---------------------------|------------|
| **Swedish Statutes (SFS)** | ✅ Good | Low | N/A |
| **Swedish Case Law (HD/HFD)** | ✅ Good | Low | Verify with Lagrummet |
| **Swedish Case Law (Lower Courts)** | ⚠️ Partial | Medium | InfoTorg, Domstol.se |
| **EU Regulations** | ❌ Missing | **High** | @ansvar/eu-regulations-mcp |
| **EU Directives** | ❌ Missing | **High** | @ansvar/eu-regulations-mcp |
| **CJEU Case Law** | ❌ Missing | **High** | EUR-Lex, Karnov |
| **Historical Statute Versions** | ⚠️ Limited | Medium | Karnov, Riksdagen archive |
| **Legal Commentary** | ❌ Missing | **High** | Karnov, Juno, academic journals |
| **Preparatory Works (Full Text)** | ⚠️ Partial | Medium-High | Riksdagen.se, Karnov |
| **Förordningar (Regulations)** | ❌ Missing | Medium | Riksdagen.se, Lagrummet |
| **International Treaties** | ❌ Missing | Medium | ECHR, HUDOC, UN Treaty |
| **Legal Definitions** | ⚠️ Limited | Low-Medium | Juridiska Ordbok, Karnov |

---

## Recommended Multi-Source Research Strategy

### For Professional Legal Work

**1. Initial Research** (This Tool)
- Quick statutory lookups
- Case law keyword search
- Preliminary hypothesis generation

**2. EU Law Layer** (@ansvar/eu-regulations-mcp)
- Identify applicable EU Regulations/Directives
- Check CJEU case law on interpretation
- Review EDPB/Commission guidance

**3. Official Verification** (Lagrummet.se, Riksdagen.se)
- Verify statute currency and amendments
- Check official case law citations
- Access preparatory works

**4. Professional Database** (Karnov, Juno)
- Read editorial commentary and annotations
- Review practice notes and precedent analysis
- Check cross-references and related sources
- Confirm no recent developments missed

**5. Academic Research** (If Needed)
- Juridisk Tidskrift, SvJT articles
- Doctoral dissertations and treatises
- Comparative law sources

---

## Future Roadmap: Expanding Coverage

### Planned Enhancements

**Near-Term (Next 6 Months)**:
- [ ] Full-text preparatory works (propositioner, SOUs)
- [ ] Förordningar (government regulations)
- [ ] Expanded definitions table
- [ ] Historical statute version tracking

**Medium-Term (6-12 Months)**:
- [ ] Integration with @ansvar/eu-regulations-mcp (EU law layer)
- [ ] ECHR and ECtHR case law
- [ ] Lower court decision ingestion (via Domstol.se)
- [ ] Legal commentary integration (if licensed sources available)

**Long-Term (12+ Months)**:
- [ ] Nordic law integration (Norway, Denmark, Finland)
- [ ] Comparative law sources
- [ ] AI-powered cross-referencing and relationship mapping

---

## How to Request Coverage Expansion

**Want a specific legal source added?**

1. **Open GitHub Issue**: https://github.com/Ansvar-Systems/swedish-law-mcp/issues
2. **Label**: `coverage-enhancement`
3. **Include**:
   - Source name and URL
   - License status (open data, API terms, copyright)
   - Use case (why this source matters for legal research)
   - Estimated impact (how many users would benefit)

**Community Contributions Welcome**: If you have expertise in a specific legal area and want to contribute data or parsers, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Summary: What This Tool Is NOT

❌ **NOT a complete legal research platform**
❌ **NOT a substitute for Karnov/Juno/commercial databases**
❌ **NOT comprehensive without EU law integration**
❌ **NOT authoritative for professional legal work without verification**
❌ **NOT a replacement for reading preparatory works and commentary**

**This Tool Is**:
✅ A **starting point** for legal research
✅ A **supplement** to professional databases
✅ A **rapid lookup** tool for known citations
✅ An **open-source alternative** for preliminary research

**Golden Rule**: Use this Tool as **one source among many**, not the sole basis for legal conclusions.

---

**Last Updated**: 2026-02-12
**Tool Version**: 0.1.0 (Pilot/Research)
