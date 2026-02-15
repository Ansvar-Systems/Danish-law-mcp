# Project MCP Compliance Audit (2026-02-14)

Scanned root: `/Users/jeffreyvonrotz/Projects`
Total MCP-related repositories: **20**

## P0 Repositories (0)
None

## P1 Repositories (6)
- `security-controls-mcp`: 9 findings
- `swedish-law-mcp`: 7 findings
- `Vendor_Intelligence_MCP`: 8 findings
- `Document-Logic-MCP`: 7 findings
- `TPRM-Frameworks-mcp`: 7 findings
- `US_Compliance_MCP`: 6 findings

## P2 Repositories (13)
- `Automotive-MCP`: 5 findings
- `EU_compliance_MCP`: 5 findings
- `client_context_mcp`: 7 findings
- `mcp-sqlite`: 8 findings
- `threat-intel-mcp`: 6 findings
- `STRIDE-mcp`: 6 findings
- `Slovenian-law-mcp`: 7 findings
- `Dutch-law-mcp`: 6 findings
- `GLEIF-mcp`: 5 findings
- `template-law-mcp`: 6 findings
- `German-law-mcp`: 5 findings
- `mcp-server-template`: 4 findings
- `nordic-law-mcp`: 4 findings

## P3 Repositories (1)
- `ot-security-mcp`: 2 findings

## Repo Matrix

| Repo | Priority | Runtime | Manifest | Server JSON | Annotations | Streamable HTTP | Privacy Doc | Findings |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `security-controls-mcp` | P1 | N | Y | Y | N | N | N | 9 |
| `swedish-law-mcp` | P1 | Y | Y | Y | N | Y | Y | 7 |
| `Vendor_Intelligence_MCP` | P1 | N | N | N | N | N | N | 8 |
| `Document-Logic-MCP` | P1 | N | Y | N | N | N | N | 7 |
| `TPRM-Frameworks-mcp` | P1 | N | Y | Y | N | N | N | 7 |
| `US_Compliance_MCP` | P1 | Y | Y | Y | N | Y | N | 6 |
| `Automotive-MCP` | P2 | Y | Y | Y | N | Y | N | 5 |
| `EU_compliance_MCP` | P2 | Y | Y | Y | N | Y | N | 5 |
| `client_context_mcp` | P2 | Y | Y | N | N | Y | N | 7 |
| `mcp-sqlite` | P2 | Y | N | N | N | N | N | 8 |
| `threat-intel-mcp` | P2 | N | Y | N | N | N | N | 6 |
| `STRIDE-mcp` | P2 | Y | Y | N | N | Y | N | 6 |
| `Slovenian-law-mcp` | P2 | Y | N | Y | N | N | N | 7 |
| `Dutch-law-mcp` | P2 | Y | Y | Y | N | Y | Y | 6 |
| `GLEIF-mcp` | P2 | Y | Y | Y | N | Y | N | 5 |
| `template-law-mcp` | P2 | Y | N | N | N | N | N | 6 |
| `German-law-mcp` | P2 | Y | N | N | N | N | N | 5 |
| `mcp-server-template` | P2 | Y | Y | N | N | N | N | 4 |
| `nordic-law-mcp` | P2 | Y | Y | N | N | N | N | 4 |
| `ot-security-mcp` | P3 | Y | Y | Y | N | N | N | 2 |

## Top Cross-Repo Gaps

- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title). (**20 repos**)
- Missing PRIVACY.md (privacy policy/documentation gap). (**18 repos**)
- No standard testing account/sample-data instructions detected for directory review. (**17 repos**)
- Troubleshooting guidance not clearly documented. (**15 repos**)
- Fewer than 3 prompt/use-case examples detected in README. (**11 repos**)
- Helpful runtime error handling not clearly detected. (**9 repos**)
- Remote-like server has no obvious OAuth 2.0 documentation/configuration. (**9 repos**)
- Limited evidence of token-frugality controls (limits/optional fields). (**6 repos**)
- No obvious runtime entrypoint found (likely incomplete or metadata-only). (**5 repos**)
- Runtime exposes tools missing in manifest: ['about'] (**4 repos**)
- Support/contact channel not clearly documented. (**3 repos**)
- Manifest lists tools not found in runtime: ['get_provision_at_date'] (**1 repos**)

## Per-Repo Findings

### security-controls-mcp — P1
Path: `/Users/jeffreyvonrotz/Projects/security-controls-mcp`
Manifest tools declared: 9
- No obvious runtime entrypoint found (likely incomplete or metadata-only).
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- Limited evidence of token-frugality controls (limits/optional fields).
- Remote-like server but Streamable HTTP support not detected.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### swedish-law-mcp — P1
Path: `/Users/jeffreyvonrotz/Projects/swedish-law-mcp`
Runtime tools detected: 14
Manifest tools declared: 14
- Manifest lists tools not found in runtime: ['get_provision_at_date']
- Runtime exposes tools missing in manifest: ['about']
- Smithery tool list does not match runtime tools.
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Troubleshooting guidance not clearly documented.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### Vendor_Intelligence_MCP — P1
Path: `/Users/jeffreyvonrotz/Projects/Vendor_Intelligence_MCP`
- No obvious runtime entrypoint found (likely incomplete or metadata-only).
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- Limited evidence of token-frugality controls (limits/optional fields).
- No standard testing account/sample-data instructions detected for directory review.

### Document-Logic-MCP — P1
Path: `/Users/jeffreyvonrotz/Projects/Document-Logic-MCP`
- No obvious runtime entrypoint found (likely incomplete or metadata-only).
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Helpful runtime error handling not clearly detected.
- Limited evidence of token-frugality controls (limits/optional fields).
- No standard testing account/sample-data instructions detected for directory review.

### TPRM-Frameworks-mcp — P1
Path: `/Users/jeffreyvonrotz/Projects/TPRM-Frameworks-mcp`
- No obvious runtime entrypoint found (likely incomplete or metadata-only).
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- Limited evidence of token-frugality controls (limits/optional fields).

### US_Compliance_MCP — P1
Path: `/Users/jeffreyvonrotz/Projects/US_Compliance_MCP`
Runtime tools detected: 11
Manifest tools declared: 10
- Runtime exposes tools missing in manifest: ['about']
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Troubleshooting guidance not clearly documented.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### Automotive-MCP — P2
Path: `/Users/jeffreyvonrotz/Projects/Automotive-MCP`
Runtime tools detected: 6
Manifest tools declared: 5
- Runtime exposes tools missing in manifest: ['about']
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### EU_compliance_MCP — P2
Path: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP`
Runtime tools detected: 10
Manifest tools declared: 9
- Runtime exposes tools missing in manifest: ['about']
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### client_context_mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/client_context_mcp`
Manifest tools declared: 7
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### mcp-sqlite — P2
Path: `/Users/jeffreyvonrotz/Projects/mcp-sqlite`
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Support/contact channel not clearly documented.
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- Limited evidence of token-frugality controls (limits/optional fields).
- No standard testing account/sample-data instructions detected for directory review.

### threat-intel-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/threat-intel-mcp`
- No obvious runtime entrypoint found (likely incomplete or metadata-only).
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Helpful runtime error handling not clearly detected.
- Limited evidence of token-frugality controls (limits/optional fields).
- No standard testing account/sample-data instructions detected for directory review.

### STRIDE-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/STRIDE-mcp`
Manifest tools declared: 11
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### Slovenian-law-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/Slovenian-law-mcp`
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Support/contact channel not clearly documented.
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- No standard testing account/sample-data instructions detected for directory review.

### Dutch-law-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/Dutch-law-mcp`
Runtime tools detected: 14
Manifest tools declared: 14
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- Helpful runtime error handling not clearly detected.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### GLEIF-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/GLEIF-mcp`
Runtime tools detected: 3
Manifest tools declared: 3
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Troubleshooting guidance not clearly documented.
- Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- No standard testing account/sample-data instructions detected for directory review.

### template-law-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/template-law-mcp`
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Support/contact channel not clearly documented.
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- No standard testing account/sample-data instructions detected for directory review.

### German-law-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/German-law-mcp`
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.
- No standard testing account/sample-data instructions detected for directory review.

### mcp-server-template — P2
Path: `/Users/jeffreyvonrotz/Projects/mcp-server-template`
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Fewer than 3 prompt/use-case examples detected in README.
- Troubleshooting guidance not clearly documented.

### nordic-law-mcp — P2
Path: `/Users/jeffreyvonrotz/Projects/nordic-law-mcp`
Manifest tools declared: 4
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
- Troubleshooting guidance not clearly documented.
- No standard testing account/sample-data instructions detected for directory review.

### ot-security-mcp — P3
Path: `/Users/jeffreyvonrotz/Projects/ot-security-mcp`
Runtime tools detected: 7
Manifest tools declared: 7
- Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- Missing PRIVACY.md (privacy policy/documentation gap).
