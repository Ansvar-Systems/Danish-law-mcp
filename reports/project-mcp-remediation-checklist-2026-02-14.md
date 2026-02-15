# MCP Remediation Checklist (2026-02-14)

Source audit: `/Users/jeffreyvonrotz/Projects/swedish-law-mcp/reports/project-mcp-compliance-audit-2026-02-14.json`

Execution rule: close all Wave 1 items before Wave 2; close all Wave 2 before Wave 3.

Global baseline to apply in every active MCP repo:
- [ ] Add tool annotations (`title`, `readOnlyHint`, `destructiveHint`) to all tools
- [ ] Add/refresh `PRIVACY.md` and link it in `README.md`
- [ ] Add troubleshooting section and 3+ prompt examples in `README.md`
- [ ] Add testing account/sample-data section for directory reviewers
- [ ] Verify manifest/runtime tool parity and fix mismatches
- [ ] Confirm Streamable HTTP for remote endpoints and document auth mode

## Wave 1

### swedish-law-mcp (P1)
Path: `/Users/jeffreyvonrotz/Projects/swedish-law-mcp`
Required actions:
- [ ] Manifest lists tools not found in runtime: ['get_provision_at_date']
- [ ] Runtime exposes tools missing in manifest: ['about']
- [ ] Smithery tool list does not match runtime tools.
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### Dutch-law-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/Dutch-law-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### ot-security-mcp (P3)
Path: `/Users/jeffreyvonrotz/Projects/ot-security-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).

### US_Compliance_MCP (P1)
Path: `/Users/jeffreyvonrotz/Projects/US_Compliance_MCP`
Required actions:
- [ ] Runtime exposes tools missing in manifest: ['about']
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### EU_compliance_MCP (P2)
Path: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP`
Required actions:
- [ ] Runtime exposes tools missing in manifest: ['about']
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### Automotive-MCP (P2)
Path: `/Users/jeffreyvonrotz/Projects/Automotive-MCP`
Required actions:
- [ ] Runtime exposes tools missing in manifest: ['about']
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

## Wave 2

### STRIDE-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/STRIDE-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### GLEIF-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/GLEIF-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### security-controls-mcp (P1)
Path: `/Users/jeffreyvonrotz/Projects/security-controls-mcp`
Required actions:
- [ ] No obvious runtime entrypoint found (likely incomplete or metadata-only).
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Limited evidence of token-frugality controls (limits/optional fields).
- [ ] Remote-like server but Streamable HTTP support not detected.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### nordic-law-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/nordic-law-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Troubleshooting guidance not clearly documented.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### Slovenian-law-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/Slovenian-law-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Support/contact channel not clearly documented.
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### TPRM-Frameworks-mcp (P1)
Path: `/Users/jeffreyvonrotz/Projects/TPRM-Frameworks-mcp`
Required actions:
- [ ] No obvious runtime entrypoint found (likely incomplete or metadata-only).
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Limited evidence of token-frugality controls (limits/optional fields).

### client_context_mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/client_context_mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Remote-like server has no obvious OAuth 2.0 documentation/configuration.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### German-law-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/German-law-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] No standard testing account/sample-data instructions detected for directory review.

## Wave 3

### Document-Logic-MCP (P1)
Path: `/Users/jeffreyvonrotz/Projects/Document-Logic-MCP`
Required actions:
- [ ] No obvious runtime entrypoint found (likely incomplete or metadata-only).
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Limited evidence of token-frugality controls (limits/optional fields).
- [ ] No standard testing account/sample-data instructions detected for directory review.

### threat-intel-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/threat-intel-mcp`
Required actions:
- [ ] No obvious runtime entrypoint found (likely incomplete or metadata-only).
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Limited evidence of token-frugality controls (limits/optional fields).
- [ ] No standard testing account/sample-data instructions detected for directory review.

### Vendor_Intelligence_MCP (P1)
Path: `/Users/jeffreyvonrotz/Projects/Vendor_Intelligence_MCP`
Required actions:
- [ ] No obvious runtime entrypoint found (likely incomplete or metadata-only).
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Limited evidence of token-frugality controls (limits/optional fields).
- [ ] No standard testing account/sample-data instructions detected for directory review.

## Template/Library Track

### mcp-server-template (P2)
Path: `/Users/jeffreyvonrotz/Projects/mcp-server-template`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.

### template-law-mcp (P2)
Path: `/Users/jeffreyvonrotz/Projects/template-law-mcp`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Support/contact channel not clearly documented.
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] No standard testing account/sample-data instructions detected for directory review.

### mcp-sqlite (P2)
Path: `/Users/jeffreyvonrotz/Projects/mcp-sqlite`
Required actions:
- [ ] Missing required MCP tool annotations (readOnlyHint/destructiveHint/title).
- [ ] Missing PRIVACY.md (privacy policy/documentation gap).
- [ ] Support/contact channel not clearly documented.
- [ ] Fewer than 3 prompt/use-case examples detected in README.
- [ ] Troubleshooting guidance not clearly documented.
- [ ] Helpful runtime error handling not clearly detected.
- [ ] Limited evidence of token-frugality controls (limits/optional fields).
- [ ] No standard testing account/sample-data instructions detected for directory review.
