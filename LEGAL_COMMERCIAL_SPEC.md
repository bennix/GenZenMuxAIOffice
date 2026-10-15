# ZenSuite Enterprise Commercial Licensing Agreement & Specification

**ZenSuite | Commercial licensing, enterprise procurement and controlled-IP acquisition**

Document version: 1.1.1 | Revised: 15 October 2026 | Language: English

**Commercial contact:** Xu Zhiping (bennix), [macdevsh@gmail.com](mailto:macdevsh@gmail.com)

**Execution status.** This is an unsigned agreement template and commercial specification. Publication in a repository is an invitation to negotiate; it is not an executed license, an offer of unrestricted ownership of upstream software, or an assignment of intellectual property. It becomes binding only when authorized representatives of both parties sign the execution page and complete the required Order Form and schedules. Blank items must be completed or expressly marked "not applicable" before execution. No field is deemed agreed through silence.

**Rights boundary.** ZenSuite incorporates upstream and third-party material. This Agreement covers only rights the Licensor owns or is expressly authorized to sublicense or assign. Existing GPL grants are not revoked. Third-party copyright, attribution, patent, trademark and license conditions continue to apply. Commercial licensing does not mean that commercial use under the GPL is prohibited.

## 1. Parties, effectiveness and contract documents

**1.1 Licensor.** Xu Zhiping, acting personally or through the legal entity identified in the signed Order Form. Legal name, registration or identity number, registered address, notice address and authorized signatory must be specified in Schedule A. No company ownership or agency relationship is presumed from the name "ZenSuite".

**1.2 Licensee.** The enterprise identified in Schedule A, including only the Affiliates expressly listed there. An Affiliate means an entity controlled through more than 50% of voting rights; independent customers, resellers and joint ventures are excluded unless listed.

**1.3 Effective Date.** The date of the last authorized signature, unless Schedule A specifies a later date. License activation additionally requires receipt of the applicable payment. An assignment or exclusive grant under Tier C takes effect only at Closing under Clause 6.

**1.4 Contract package.** This Agreement includes the executed Order Form, the Asset and Rights Schedule, Technical and Acceptance Schedule, Open-Source and Exclusions Schedule, and any signed statement of work. For commercial quantities and selected rights, the signed Order Form controls; for title and exclusions, the signed Asset and Rights Schedule controls. No Order Form may waive a third party's rights without that party's authorization. Other conflicts are resolved in favor of this Agreement unless a signed amendment identifies the clause being changed.

## 2. Definitions and interpretation

**2.1 Licensed Software.** Only the named modules, versions, commits, deployment components and accompanying documentation expressly selected in Schedule A and identified by repository, immutable commit identifier and SHA-256 manifest in Schedule B. Descriptive product names and roadmap entries do not expand the grant.

**2.2 Controlled IP / Proprietary Codebase.** Copyrightable original code, documentation and other specifically identified assets owned by the Licensor, or rights the Licensor is authorized in writing to commercially sublicense or assign. It excludes Third-Party Materials, public-domain material, rights already granted to others, and rights not transferable by law. "Proprietary" describes control of identified rights; it does not represent that previously published source code is secret.

**2.3 Third-Party Materials.** Upstream code, libraries, fonts, datasets, models, services, trademarks, media, separately licensed directories and other material whose rights are held by others, whether bundled, modified, linked or accessed remotely.

**2.4 Derivative Works.** Modifications, adaptations or other works constituting derivative works under applicable copyright law. Mere use of an API or a product label does not, by itself, determine whether a work is derivative. The applicable license and law govern each case.

**2.5 GPLv3 Exemption.** A separately negotiated permission to use identified Controlled IP under commercial terms instead of relying on its GPL-3.0-only grant. It is an alternative grant by a rights holder, not a cancellation of the GPL or a waiver on behalf of upstream authors. No exemption applies to third-party copyleft code without valid separate authorization.

**2.6 AST Engine.** The specifically scheduled document-processing implementation that represents and edits OOXML structures or an abstract syntax tree, including identified parsing, patching and serialization components. It does not include every OOXML implementation or a claim to ownership of an industry standard.

**2.7 Seat and Headless / Server-side API Metric.** A Seat is one named human user authorized to access the selected software during a subscription year, irrespective of concurrent sessions. Shared accounts are prohibited. For Tier A headless microservices, shared background workers or backend API endpoints, count monthly active downstream human end-users (U) and accepted software-operation API requests (R), aggregated across the covered Organization's deployments, tenants, gateways and service accounts for each calendar month. The required Seat-equivalent is 50 multiplied by the greater of U/10,000 or R/10,000, rounded upward to whole blocks of 50 Seats; a month with no use has zero Seat-equivalents. Thus, 10,000 monthly users or requests equals 50 Seats, and 10,001 equals 100 Seats. Required committed Seats are the greater of ordinary named-user Seats and this Seat-equivalent, without adding the same usage twice. Licensee-initiated accepted processing requests count once; health checks, rejected requests and automatic retries of the same recorded operation do not. Network proxies, shared identities, batching and service accounts do not reduce measurement of the underlying accepted processing operations or distinct downstream users. The Order Form must identify the measurement period, logs, permitted deployment and monthly true-up process; Clause 9.5 governs verification and does not authorize covert telemetry. A properly scoped Tier B license covers unlimited internal use without this Seat conversion, but does not authorize external customer access or external SaaS by implication. Tier C integration metrics, if any, must be expressly stated. A Seat may be reassigned after an employee leaves or changes duties, with at most one ordinary reassignment per calendar month.

**2.8 Site / Organization.** The Licensee legal entity, covered Affiliates, locations, cloud accounts and clusters listed in Schedule A. "Unlimited internal Seats" does not include external customer access, commercial hosting for third parties or unrestricted redistribution.

**2.9 Delivery, Acceptance and Closing.** Delivery is provision of the contracted artifacts with a signed delivery manifest. Acceptance is the written confirmation or objective completion of the agreed tests under Clause 7. Closing is the exchange of final Tier C payment, executed assignment instruments and verified delivery credentials after all required conditions have been satisfied or waived in writing.

## 3. Commercial tiers and fixed price anchors

All prices are seller-set commercial asking prices in USD, exclusive of taxes, third-party fees and separately agreed work. They are not independent appraisals or guarantees of market value. The anchors below may not be reduced by a reseller or altered informally; the exact price within an applicable range must be fixed in the signed Order Form. A different price requires a signed amendment by the Licensor.

### 3.1 Tier A - Enterprise Commercial Seat License

**Scope:** Annual access to selected pre-built binaries or specifically delivered enterprise container images for internal enterprise intranet or approved cloud deployment. For Controlled IP, the commercial grant replaces reliance on the GPL, so its GPL source-disclosure conditions do not arise from that commercial grant. Third-party conditions remain applicable. Headless, shared-worker and API deployments are measured under Clause 2.7; buying a small number of operator Seats does not cover their downstream usage. External redistribution, OEM embedding and customer-facing hosting require an express additional grant, irrespective of the Seat-equivalent paid.

| Annual committed Seats | Annual fee per Seat |
|---|---|
| 1-49 | USD 500 |
| 50-200 | USD 450 |
| 201-1,000 | USD 350 |
| 1,001 or more | USD 200 |

The price envelope is **USD 200-500 per Seat per year**. Each band applies to all committed Seats for the applicable annual term. The 1,001-seat boundary avoids overlap with the 201-1,000 band. Mid-term additions are prorated at the then-applicable band; reductions take effect at renewal unless agreed otherwise.

Included: production bug fixes for supported versions, regular compliance-related software updates within the supported product scope, and initial support response within 24 elapsed hours as described in Clause 8. Legal advice, certification, new features and third-party service charges are excluded.

### 3.2 Tier B - Enterprise On-Premise Site License

**Price anchor: USD 50,000-120,000 per year per Organization.**

Unlimited internal human Seats within the signed organizational boundary; private Kubernetes or Docker deployment is included only for modules for which deployable images and deployment scripts are expressly contracted and accepted. Desktop applications are not represented as container-native services merely because they belong to ZenSuite. The Order Form must identify included modules, clusters, regions, support scope, disaster-recovery instances and any capacity limits. The exact annual fee must be stated within the price anchor before signing. No sublicensing to external customers is implied.

### 3.3 Tier C - Source Code and Controlled-IP Buyout

The Order Form must select either **C1, a perpetual source-code license**, or **C2, an assignment of identified Controlled IP**. They are legally different transactions. Exclusivity exists only for C2 or an expressly defined exclusive C1 grant, subject to prior grants and exclusions. "Buyout" alone does not identify the rights transferred.

| Asset package | Non-reducible negotiation anchor |
|---|---|
| ZenOffice: controlled kernel contributions, GB/T engine contributions and review committee implementation | USD 1,500,000-2,500,000 |
| ZenCode / ZenCoder: controlled delivery pipeline and multi-architecture build contributions | USD 1,500,000-2,000,000 |
| AIComposer plus FlowPy / DataFlash: controlled canvas and DAG data-engine contributions | USD 1,000,000-1,500,000 |
| Full ZenSuite comprehensive controlled-asset portfolio transfer | **USD 5,000,000 total** |

The full-portfolio price is a separate package price and is not the arithmetic sum of the module ranges. It includes the agreed clean asset-transfer work and standard handover for the assets expressly listed in Schedule B; it does not include ownership of upstream assets, undisclosed development work or third-party acquisition fees. MyIME and Astra AI Browser are included in the full-portfolio package only to the extent their identified Controlled IP is listed and verified. Standalone prices for those two products require a separate signed Order Form.

C1 includes source delivery and perpetual rights to use, modify, rebrand and embed the selected Controlled IP solely within the Licensee's own branded unified commercial application or SaaS, subject to Clause 4.3. A C1 grant does not include standalone resale, OEM white-label licensing or reusable-engine sublicensing. C2 includes assignment of the specified assignable rights and agreed rights to modify, rebrand, sublicense and relicense those assets. Removal of the Licensor's own attribution may be authorized only to the extent lawful and expressly specified. Neither option permits removal of third-party notices or non-waivable author rights.

## 4. License grant and retained rights

**4.1 Tiers A and B.** On activation, the Licensor grants a non-exclusive, worldwide, non-transferable right during the paid term to install, execute and internally use the selected Controlled IP within the contracted scope. Contractors may use it solely for the Licensee's benefit and under equivalent confidentiality obligations. No source-code delivery is implied unless the Order Form or escrow provisions expressly provide it.

**4.2 Proprietary integration.** Closed-source embedding and external SaaS are permitted only where the signed grant expressly identifies the Controlled IP, distribution channels and applicable commercial rights. OEM white-label distribution, standalone engine resale and developer-framework sublicensing are excluded from Tier C1. Such rights require a completed Tier C2 assignment covering those rights or a separate signed reseller/OEM amendment that expressly modifies Clause 4.3; a generic sublicensing checkbox is insufficient. The parties must separately resolve every third-party obligation applicable to the proposed integration. Purchase of a subscription does not automatically clear a complete mixed-license product for closed-source redistribution.

**4.3 Tier C1 and White-Label Limitation.** Unless Tier C2 Full Assignment of the relevant rights is executed, the ordinary Tier C1 grant permits embedding solely within the Licensee's own branded unified commercial application or SaaS. Sublicensing or distributing the Licensed Software as a standalone SDK, raw AST engine API, reusable developer framework, raw source package, or substantially equivalent standalone service for third-party reuse is prohibited. Permitted application users may consume integrated features, but may not receive separable rights to reuse the underlying engine. Rebranding the integrated application does not authorize white-label resale of the engine or downstream grants of independent commercial exemptions. These restrictions bind use under the commercial grant only and do not restrict independently held GPL or other open-source rights. After full payment and Acceptance, the selected rights are perpetual, worldwide and irrevocable solely as to the paid-up license grant, subject to the agreed scope. A later breach gives rise to contractual remedies; it does not revoke that paid-up grant unless the signed Order Form expressly provides a legally enforceable termination condition. Third-party permissions are governed by their own terms.

**4.4 Tier C2.** Assignment is governed by Clause 6 and a separate executed transfer instrument. Background tools, third-party rights and retained assets must be identified expressly. No implied patent license, transfer of domain names, trademarks, private accounts or credentials is granted unless specifically listed.

**4.5 Existing open-source rights.** A recipient may continue exercising valid rights under GPL or other open-source licenses already received. This Agreement does not retroactively withdraw those grants, prevent lawful GPL commercial activity, or convert previously public code into confidential information. Exclusivity can cover only rights still capable of exclusive disposition, subject to those prior grants. An existing GPL copy is not made exclusively proprietary by a later sale.

**4.6 No implied transfer.** Except for expressly granted rights, each party retains its IP. A product name, function, benchmark or price does not prove title to an implementation. Third-party AI model weights, API access and model outputs are outside the grant unless separately identified and legally cleared.

## 5. Use restrictions, confidentiality and fair competition

**5.1 Commercial-tier restrictions.** Under Tiers A and B, the Licensee may not bypass downstream usage accounting through headless services, shared accounts, proxies or indirect access, and may not exceed the licensed scope, sublicense to unrelated parties, resell access or use a subscription to provide a competing hosted service to third parties, unless expressly permitted. Tier B covers only the signed internal organizational boundary; it does not absorb external tenants or customer-facing hosting unless expressly contracted. Tier C1 also remains subject to Clause 4.3. These restrictions govern use under this commercial contract and do not restrict independently available open-source rights.

**5.2 Reverse engineering.** For commercial binaries, reverse engineering, decompilation or circumvention is prohibited only to the extent permitted by applicable law and the rights under which the copy is used. Statutory interoperability, security research and non-waivable rights remain unaffected. No restriction is imposed on exercising rights under an independently obtained GPL copy.

**5.3 Confidential information.** Non-public source supplied under a valid restricted grant, security information, customer data, negotiated pricing, credentials and marked or reasonably understood confidential business information are protected. Publicly available source, independently developed information, lawfully received third-party information and information already known without restriction are excluded. A recipient shall use protected information only to perform this Agreement, limit access to need-to-know personnel and apply reasonable safeguards. Ordinary confidentiality survives for five years after termination; qualifying trade secrets remain protected while they legally remain trade secrets. Mandatory disclosure is permitted with lawful advance notice and minimum necessary disclosure.

**5.4 Competition.** The parties prohibit misuse of confidential information and infringement of identified rights. This Agreement does not impose a general market non-compete, prevent independent development, or prohibit lawful competition using public information or valid open-source rights. Any additional restraint requires a separately negotiated, lawful and proportionate written agreement.

## 6. Source buyout, title diligence and transfer conditions

**6.1 Asset-specific diligence.** Before any exclusive grant or assignment, the Licensor shall deliver a title report identifying each assigned file or asset, author, employer or commissioning relationship where relevant, contributor assignment or consent, upstream origin, applicable license, prior grants, security interests and known restrictions. The parties shall identify unresolved items rather than deeming them cleared.

**6.2 Closing conditions.** Closing requires an agreed Asset and Rights Schedule, completed open-source inventory, necessary contributor and employer consents, resolution or express exclusion of title exceptions, successful technical Acceptance, execution of assignment instruments, and payment arrangements under Clause 9. The Licensee need not accept an unsubstantiated "100% ownership" assertion in place of evidence. No excluded third-party right is transferred by implication.

**6.3 Clean repository delivery.** "Clean" means an identified repository snapshot with documented provenance, license inventory, build instructions and known exceptions, and with active credentials, unauthorized personal data and malicious code removed. It does not mean all open-source components have disappeared or that the public project's historical identity has been erased. Preserve author and license notices where required. Any source-history redaction must be documented; a full historical evidence copy is retained securely where lawful.

**6.4 Assignment mechanics.** At Closing, the Licensor assigns the rights listed in the transfer instrument to the extent legally assignable, free of undisclosed liens, subject to the disclosed prior licenses and exclusions. The Licensor shall sign reasonable further documents needed to perfect the specified transfer. Moral rights are waived or consents provided only to the extent legally permissible; non-waivable rights remain unaffected. Patent, trademark, domain, dataset and design-right transfers require separate identification and formalities.

**6.5 Prior GPL distribution.** Existing GPL grants and third-party licenses survive. The buyer acknowledges that previous lawful recipients may retain, use and redistribute previously released versions under their applicable licenses. Neither party warrants the ability to withdraw those copies from the public or prevent lawful forks.

## 7. Delivery, verification, acceptance and escrow

**7.1 Tier A deliverables.** Selected binaries, a version and checksum manifest, installation and rollback instructions, license entitlement record, administrator documentation, third-party notices and a support contact. Signing or notarization must be identified per platform rather than presumed.

**7.2 Tier B deliverables.** Tier A items plus the specifically contracted container images, image digests, deployment manifests, configuration reference, secret-management instructions, backup and restoration procedure, and capacity assumptions. An unavailable service image is a development deliverable, not an existing feature.

**7.3 Tier C deliverables.** Complete selected source snapshots and scheduled history, commit and Tag references, source SHA-256 manifests, SBOM and license/provenance report, lockfiles and toolchain versions, build and packaging scripts, tests and test results, architecture and API documents, deployment scripts where applicable, agreed design assets and the executed rights instruments. External service accounts and credentials transfer only through lawful account-transfer mechanisms; plaintext credentials are not placed in repositories.

**7.4 Acceptance.** Within 30 calendar days after a complete Delivery, the Licensee shall run the signed Schedule C tests and either accept in writing or provide reproducible, material failures against an agreed criterion. The Licensor has 20 business days, or another agreed period, to cure. The Licensee shall retest the corrected scope within 10 business days. Silence, trial use or partial deployment does not itself constitute Acceptance. Minor issues may be accepted against a documented remediation plan. Unresolved material failure after two cure cycles permits rejection of the affected deliverable and refund of amounts allocated to that rejected, undelivered scope, subject to return or deletion of restricted material.

**7.5 Reproducibility and platform evidence.** Each claimed platform must have an identified artifact, build commit, architecture, toolchain and a recorded install or smoke test. Store hashes of inputs and outputs. Reproducible-build status must be tested; a successful build alone is not described as bit-for-bit reproducibility.

**7.6 Escrow.** If selected, the parties shall appoint an independent escrow agent under a separate three-party agreement before the first deposit. Deposit the scheduled source, dependency and build materials at initial Delivery and each supported major release. Release triggers include insolvency accompanied by service cessation, permanent discontinuation of contracted maintenance, or an uncured material maintenance breach lasting 30 days after written notice. Notice, objection and verification procedures must be specified in the escrow agreement. Released material is usable only to maintain the licensed deployment, within rights the Licensor can grant; escrow release is not an IP buyout. Agent fees and deposit-validation costs are fixed in Schedule A. No functioning escrow is represented until that agreement and deposit exist.

## 8. Maintenance, SLA and operational responsibilities

**8.1 Response commitment.** During a paid Tier A or B term, initial human acknowledgement and triage will occur within **24 elapsed hours** after a complete production support request reaches the designated channel. This is a response target, not a guaranteed repair or restoration deadline. The support record must identify impact, version, diagnostics, workarounds and next-update time. Severity P1 means production outage or credible critical security exposure; P2 means serious degradation; P3 means other defects. Escalation contacts and support languages are specified in Schedule A.

**8.2 Included maintenance.** Production defect fixes in supported versions, security patches within the Licensor's control, supported-version compatibility updates and regular compliance-related product updates within the contracted specification. Statutory certification, legal opinions, new integrations and custom features require an agreed statement of work. No software is warranted to satisfy every future law or every interpretation of GB/T 9704.

**8.3 SLA credits.** For an attributable missed 24-hour response, a 2% credit of the affected module's monthly-equivalent subscription fee applies per incident, capped at 10% for that month. The Licensee must claim within 30 days. Credits do not extinguish remedies for fraud, willful misconduct, confidentiality breach or material breach, and are not an unlimited uptime guarantee. Self-hosted infrastructure availability is the Licensee's responsibility unless an operations service is separately contracted.

**8.4 Customer and third-party dependencies.** The Licensee is responsible for lawful data use, endpoint and identity administration, backups and its infrastructure. Model APIs, external networks, operating systems, app stores and third-party services remain outside the Licensor's direct control. Their fees and terms are disclosed separately. "Local" or "private" processing is not promised where the configured workflow sends content to a remote model or service.

## 9. Payment, taxes and audit

**9.1 Subscription payment.** Tier A and B annual fees are invoiced in advance, payable within 15 calendar days of invoice. Renewal requires written confirmation at least 30 days before term end; there is no implied automatic renewal. Renewal scope and price must be stated in writing. Undisputed late payments may accrue simple interest at 1% per month or the maximum lawful rate, whichever is lower, after written notice and a 15-day cure period. Disputed amounts supported by specific reasons do not trigger suspension of paid rights while the parties reasonably resolve them.

**9.2 Tier C milestones.** Unless the Order Form states otherwise: 20% is placed in an independent transaction escrow at signing for title diligence; 30% becomes payable on complete source Delivery and satisfactory initial title review; the final 50% is payable at Closing after Acceptance and exchange of executed transfer documents. Deposit release conditions must be specified before payment. If the agreed title conditions cannot be met and the Licensee has not accepted disclosed exclusions, unearned escrowed sums are returned. Independent transaction escrow is distinct from source-code escrow. No rights assignment occurs merely because a deposit is paid.

**9.3 Currency, onshore procurement and taxes.** USD is the contract currency unless the signed Order Form elects the Mainland China Onshore Procurement Rider under Clause 13. That rider may provide a fixed CNY contract price, payment to the designated mainland corporate bank account and lawful local VAT invoices, including special VAT invoices where the supplier is eligible and the transaction qualifies. The onshore supplier must be a named, verified legal entity with documented authority to license or supply the contracted rights; no mainland company, corporate account, invoice qualification or collection agency is presumed to exist. Issuer identity, taxpayer number, invoice category, tax rate, beneficiary and account details must be completed before execution. An RMB payment may be used only if agreed in the Order Form, which must state the precise conversion rate or identify the published PBOC USD/CNY central parity rate and valuation date. No party may choose a rate unilaterally after invoicing. Fees exclude applicable VAT and similar transaction taxes. Legally required withholding is remitted with supporting certificates; any gross-up must be expressly agreed and lawful. Bank charges and allocation of transfer fees must be stated in the Order Form.

**9.4 Wire controls.** Pay only to the beneficiary named in the signed payment instruction. A bank-account change requires signed notice and verification through a previously established independent communication channel. No cryptocurrency payment, personal remittance route or third-party payee is presumed authorized.

**9.5 Seat and scope audit.** The Licensee shall keep reasonable entitlement records for two years. At most once in any 12-month period, on 15 business days' notice, an independent auditor bound by confidentiality may review records needed to verify license scope during business hours. No unrelated customer data or unrestricted system access is required. The Licensor bears audit costs unless a verified shortfall exceeds 5% of the relevant year's fees, in which case reasonable documented audit costs and unpaid fees are payable. There is no automatic telemetry or covert inspection right. Confidential audit data may be used only to administer this Agreement.

## 10. Ownership warranties, product warranties and indemnity

**10.1 Authority and title.** Each party warrants its authority to enter this Agreement. The Licensor warrants that it owns or holds sufficient documented rights to grant the specific Controlled IP rights identified in the executed schedules and has disclosed known third-party components, prior grants, liens and material title limitations after reasonable investigation. For an assigned asset, the Licensor warrants sole ownership of the rights actually assigned only if that asset's chain of title supports that representation. There is no portfolio-wide representation of sole authorship over upstream material.

**10.2 No unsubstantiated clearance guarantee.** The Licensor does not represent "zero open-source contamination" or universal freedom from infringement. Instead it shall provide the scheduled SBOM, license analysis, contributor evidence and exceptions. Material undisclosed licensing obligations affecting the contracted proprietary use constitute a breach of the specific rights warranty, subject to the agreed remedies. Known unresolved title issues must be cured or excluded before Closing.

**10.3 Product warranty.** For 90 days after Acceptance, the selected software will materially conform to the accepted Schedule C specification under the agreed environment. The remedy is correction, replacement or, if the affected material nonconformity cannot be cured within the agreed cure process, refund of the allocated fees for the rejected scope. Lossless editing, privacy, regulatory conformity, model quality and cross-platform coverage are warranted only against explicit accepted test cases, not as absolute claims across all inputs or configurations.

**10.4 IP indemnity.** The Licensor shall defend a third-party claim that the Licensee's authorized use of the Controlled IP infringes that party's copyright or a specifically warranted right, and pay final court awards or approved settlements, subject to Clause 11. The Licensee must promptly notify, permit control of the defense and provide reasonable cooperation. No settlement may admit liability for, impose non-monetary obligations on, or restrict the Licensee without its consent, not unreasonably withheld. The Licensor may procure the required rights, modify or replace the affected software without material loss of agreed functionality, or terminate the affected grant and refund the unused subscription or the fees allocated to the affected paid-up asset if the agreed rights cannot be delivered. This contractual remedy cannot revoke rights held independently under the GPL.

**10.5 Exclusions and customer indemnity.** The Licensor is not responsible for claims caused solely by unauthorized modifications, combinations not supplied or approved where the claim would otherwise not arise, continued infringing use after a lawful equivalent remedy is offered, or Licensee-provided content. The Licensee shall defend and indemnify claims caused by its unlawful content or its independently infringing modifications, subject to the same notice and defense safeguards. These exclusions do not excuse the Licensor's own undisclosed third-party licensing obligations.

**10.6 Other warranties.** Except for express warranties and non-excludable legal obligations, no implied warranty of fitness for every customer purpose, uninterrupted service, flawless model output or compliance with all procurement regimes is given. Enterprise decisions and factual outputs require appropriate human review.

## 11. Liability and remedies

**11.1 General cap.** Except as stated below, each party's total liability arising from this Agreement is capped at the fees paid or payable for the affected Order Form during the preceding 12 months. For a paid-up Tier C transaction, the general cap is the total consideration allocated to that transaction, rather than a zero-fee post-Closing period.

**11.2 Enhanced cap.** Liability for the IP indemnity and breach of confidentiality or contracted security obligations is capped at twice that applicable amount. Liability for fraud, willful misconduct, unpaid fees, intentional misappropriation of the other party's rights, death or personal injury caused by negligence where legally non-excludable, and other liability that cannot lawfully be limited is not capped. Obligations to return unearned funds or complete an agreed asset transfer are not extinguished by exhausting a damages cap.

**11.3 Excluded losses.** To the extent lawful, neither party is liable for indirect or consequential loss or speculative lost profits. Reasonable data restoration and incident-response costs that directly result from a covered breach, and amounts payable under the express third-party indemnity, are not excluded merely because of their label. Each party shall reasonably mitigate loss. No double recovery is permitted.

## 12. Term, suspension and termination

Tier A and B grants run for the paid annual term. Material breach permits termination only after written notice and 30 days to cure, except an imminent unlawful security threat may justify proportionate temporary suspension of affected services with prompt notice and restoration when resolved. Expiry or termination ends unpaid subscription rights and support, and requires removal of restricted commercial copies within 30 days, subject to lawful archival retention. Independently held open-source rights remain unaffected. Paid-up Tier C1 rights and completed C2 assignments survive as provided above. Confidentiality, accrued payment obligations, ownership, liability, dispute resolution and audit rights for the permitted retention period survive as applicable.

## 13. Governing law and dispute resolution

**13.1 Default cross-border option.** Unless both parties sign the Mainland China Onshore Procurement Rider below, the following Hong Kong law and HKIAC provisions apply.


This Agreement and non-contractual obligations connected with it are governed by the laws of the Hong Kong Special Administrative Region, excluding conflict-of-law rules and the United Nations Convention on Contracts for the International Sale of Goods. Mandatory laws applicable to a party, regulated data or non-waivable rights remain applicable.

The parties shall attempt good-faith resolution for 30 days after a written dispute notice. Any unresolved dispute, including existence, validity, interpretation, performance, breach or termination of this Agreement, shall be finally resolved by arbitration administered by the **Hong Kong International Arbitration Centre (HKIAC)** under the HKIAC Administered Arbitration Rules in force when the Notice of Arbitration is submitted. The seat of arbitration is Hong Kong; the language is English; the tribunal consists of one arbitrator unless the parties agree in writing to three. The award is final and binding subject to applicable law. A party may seek urgent interim or conservatory relief from a competent court without waiving arbitration. The arbitration agreement is governed by Hong Kong law.

**13.2 Mainland China Onshore Procurement Rider - signed election required.** For procurement within mainland China requiring a local contracting entity, CNY corporate settlement and local VAT invoices, the parties may elect this rider in Schedule A. Upon that express signed election, the substantive laws of the People's Republic of China apply; for this rider only, this means mainland China and excludes Hong Kong, Macao and Taiwan. Any dispute arising from or in connection with this Agreement shall be submitted to the Shanghai International Economic and Trade Arbitration Commission (Shanghai International Arbitration Center, SHIAC) for arbitration in Shanghai in accordance with its arbitration rules in force when arbitration is commenced. The arbitration agreement is governed by PRC law; the arbitration language is Chinese unless Schedule A selects another language; one arbitrator shall be appointed unless the parties agree otherwise in writing. The award is final and binding subject to applicable law. This rider replaces the default Hong Kong governing-law and HKIAC arbitration provisions for the elected Order Form; the two arbitration clauses do not operate concurrently. The parties may seek lawful interim relief through the competent authorities. CNY price, the authorized domestic supplier, corporate beneficiary, applicable taxes and invoicing details must be completed in Schedule A. The English text remains controlling unless a signed bilingual execution version expressly provides otherwise. Procurement eligibility and any mandatory tender requirements must be established for the specific buyer; this rider does not itself certify eligibility.

## 14. General provisions

Notices shall be sent to the addresses in Schedule A; email is effective when receipt is acknowledged or independently documented, excluding delivery failure notices. Neither party may assign this Agreement without consent, except a permitted internal reorganization that does not reduce performance ability, or a transfer expressly implemented under Tier C. The parties are independent contractors. Neither is the other's agent. Amendments require signatures of both parties. Waivers are specific and do not waive later breaches. Invalid provisions are severed or narrowed to the minimum lawful extent without rewriting the core bargain. Force majeure excuses affected performance, other than payment already due, only while the event remains beyond reasonable control and the affected party gives prompt notice and mitigates; prolonged interruption over 60 days permits termination of undelivered affected services with an appropriate refund. Applicable privacy, data-transfer, employment, tax and export-control requirements remain the responsibility of the party subject to them. This Agreement is the entire agreement on its subject. Counterparts and legally valid electronic signatures are permitted. English controls; translated summaries do not amend the signed text.

## Schedule A - Order Form and signature-ready commercial particulars

Complete every field or mark it not applicable. This Schedule must be signed with the main Agreement.

| Required item | Agreed entry |
|---|---|
| Order reference and Effective Date | ________________________________________ |
| Licensor legal name and capacity (individual / entity) | ________________________________________ |
| Licensor identity or registration number and address | ________________________________________ |
| Licensee legal name, registration number and address | ________________________________________ |
| Named covered Affiliates and Organization boundary | ________________________________________ |
| Selected tier (A / B / C1 / C2) and exact grant | ________________________________________ |
| Selected modules, versions and Schedule B asset IDs | ________________________________________ |
| Seat commitment / sites / clusters / regions | ________________________________________ |
| Annual term, activation and support period | ________________________________________ |
| Exact USD fee and approved RMB conversion, if any | ________________________________________ |
| Taxes, withholding, bank fees and beneficiary | ________________________________________ |
| Tier C milestones and independent escrow agent | ________________________________________ |
| Support and escalation channels / language | ________________________________________ |
| Delivery dates, acceptance environment and contacts | ________________________________________ |
| Source escrow agent and cost allocation, if selected | ________________________________________ |
| Notice emails and physical addresses | Licensor contact: macdevsh@gmail.com; other details: __________________ |
| Mainland onshore rider elected? (Yes / No; both parties initial) | ________________________________________ |
| Authorized mainland supplier legal name / unified social credit code | ________________________________________ |
| Supplier rights authority / licensor relationship / contracting capacity | ________________________________________ |
| CNY fixed price or agreed exchange rate and date | ________________________________________ |
| Corporate account name / bank / account / settlement reference | ________________________________________ |
| VAT invoice type / tax rate / supplier and purchaser taxpayer details | ________________________________________ |
| Law and forum: default HK / HKIAC or elected PRC / SHIAC | ________________________________________ |
| Arbitration language / bilingual controlling text, if varied | ________________________________________ |
| Signed deviations identifying affected clauses | ________________________________________ |

## Schedule B - Asset identity, scope and provenance

**B.1 Controlled-asset register.** For every module, attach: asset ID; repository and fixed commit; exact files or directories; author and employer/contributor evidence; rights being licensed or assigned; previous public grants; background IP; liens; third-party dependencies and restrictions; acceptance artifact hashes; and required consents. A repository name alone is insufficient. The register must be countersigned before a proprietary buyout can close.

**B.2 Initial repository references.** These references locate the projects. They are not a title opinion or a representation that every file in each repository is Controlled IP.

| Product | Reference repository |
|---|---|
| ZenOffice | https://github.com/bennix/GenZenMuxAIOffice |
| ZenCode / ZenCoder | https://github.com/bennix/ZCode |
| AIComposer / FlowArt | https://github.com/bennix/AIComposer |
| DataFlash | https://github.com/bennix/DataFlash |
| FlowPy | https://github.com/bennix/FlowPy |
| MyIME | https://github.com/bennix/MyIME |
| Astra AI Browser | https://github.com/bennix/AstraAIBrowser |

**Associated Academic & Theoretical IP - background reference.** *General World Models: The Physics of Generative Video*, Zhiping Xu, Apress / Springer Nature, 2026; print ISBN 9798868831430 (979-8-8688-3143-0); electronic ISBN 979-8-8688-3144-7. Publisher product page: [https://link.springer.com/book/10.1007/979-8-8688-3144-7](https://link.springer.com/book/10.1007/979-8-8688-3144-7). Persistent DOI: [https://doi.org/10.1007/979-8-8688-3144-7](https://doi.org/10.1007/979-8-8688-3144-7).

**Grant scope.** The Licensor identifies this monograph as an associated theoretical reference for ZenSuite spatial-temporal modeling and multimodal generative-engine design. A publication citation does not establish that every product implements the book's concepts, prove ownership of general scientific theories, or imply endorsement by Apress or Springer Nature. The publisher agreement, author-retained rights, permissions and any included manuscript, figures, teaching materials or companion code must be identified in the Controlled-asset register before reproduction, sublicensing or transfer. No book publishing rights, publisher marks, third-party illustrations or exclusive rights over general principles are conveyed by this reference alone. Any specifically licensed author-controlled material requires a separately identified grant and acceptance deliverable.

**B.3 Public source snapshots recorded on 15 October 2026.** These Tags predate publication of this Agreement and identify licensing/source snapshots, not a transfer instrument or a newly rebuilt binary release. Platform times below are UTC.

| Repository | Source Tag | Fixed source commit | Public Release time |
|---|---|---|---|
| ZenOffice | v0.6.102-gpl3 | fd9b962f4680ed7baabd3e5545c4d3fed82c80dc | 2026-10-15 02:11:54 UTC |
| ZenCode / ZenCoder | v3.14.32-gpl3 | 01de25405d8bd384e00f49f0ec9b5182551f4d02 | 2026-10-15 02:11:31 UTC |
| AIComposer | v2.1.0-gpl3 | e5f1b6a9009cb57a8b55b62ba9abbeb65cfab5b3 | 2026-10-15 02:10:23 UTC |

Each corresponding Release contains a source archive, `SOURCE_AND_ASSET_MANIFEST.json` and `SHA256SUMS`. The manifest identifies source and historical binary assets. Existing binaries were not relabeled as builds from these new source Tags. GitHub timestamps and hashes are evidence records, not judicial certification, proof of originality or automatic findings of intentional infringement.

## Schedule C - Technical specification and acceptance matrix

**C.1 Status rules.** The following is a procurement scope and acceptance framework. "Located" means relevant implementation was identified during limited repository inspection; it does not establish completeness, benchmark performance, ownership or production certification. "Proposed / unverified" means the capability must be demonstrated, developed or excluded in the signed statement of work. No roadmap entry is deemed delivered or accepted solely by inclusion here. The six-gate commercial harness has the separately defined contractual delivery status in C.3, rather than a public-branch inspection classification. Quantitative datasets, environments and thresholds must be signed before Acceptance.

### C.2 ZenOffice - document kernel and academic review

| Capability | Scope and required acceptance evidence |
|---|---|
| Native OOXML AST precision patch engine | Relevant DOCX parsing and structural scanning implementation was located. Deliver the scheduled parser, patch and serializer components. On an agreed corpus, record untouched package-part hashes, XML semantic diffs, relationships and round-trip openability. "Lossless" applies only to accepted invariants and supported constructs; unknown fields, charts, macros, embedded objects and signatures require explicit test coverage and exceptions. |
| GB/T 9704 official-document formatting | Relevant generator and authoring integration were located. Test the signed formatting matrix for page geometry, fonts, headings, document number, addressee, date, seals/reserved areas and pagination using available licensed fonts. Deliver a machine-readable audit report and human-reviewed specimens. This is software conformity testing, not governmental certification or a legal conclusion that every document complies. |
| Workbook-as-Database SQL | Seller-proposed scope subject to demonstration. Define supported workbook formats, schema inference, SQL dialect, type/null mapping, mutation and transaction semantics, formula handling, row/size limits and export behavior. Validate against agreed golden queries and datasets; preservation of Excel semantics must be tested separately. |
| Academic Peer Review Committee | Relevant review committee/runner components were located in the wider project snapshot; the exact contracted configuration must be verified. Demonstrate three reviewer roles plus one chair, model routing, citation/equation/table/manuscript consistency checks, traceable findings and a consolidated report. Define input formats and human approval. Model conclusions are advisory and not warranted as correct peer review or publication acceptance. |

### C.3 ZenCode / ZenCoder - engineering platform and delivery

| Capability | Scope and required acceptance evidence |
|---|---|
| ZenMux multi-model gateway | Seller-proposed contracted behavior must be demonstrated against selected model/provider versions. Verify credential isolation, routing and failure handling, supported context retention, context truncation policy and requested temperature mapping. Provider differences and unsupported sampling parameters must be disclosed; "stabilization" does not guarantee deterministic or equivalent model output. |
| Strict 6-Step QA delivery flow | **Tier C Exclusive Commercial Deliverable - dedicated engineering harness and automation scripts.** The contracted delivery package shall identify the harness repository or private source bundle, exact commit, script entry points and reference targets in its signed delivery manifest. This label means commercial-only delivery scope, not a grant of exclusive copyright under C1; it does not itself represent an existing private branch or release. No particular unpublished path or branch is incorporated without identification in that manifest. The six required gates are Requirements, Static Analysis, Unit Testing, Multi-Agent Review, Runtime Validation and Artifact Packaging. Acceptance requires execution of the scripted six-gate harness against the signed reference targets, with recorded per-gate inputs, outputs, failure states and blocking conditions; injected gate failures must prevent an unsupported success state or final package claim. This scope is accepted only after demonstration and verification under Clause 7; payment or inclusion in a proposal is not evidence of technical completion. |
| Manim mathematics and physics rendering | Proposed / unverified. Identify Manim version, license, rendering toolchain, fonts and any voice/model dependencies. Render the agreed mathematical and physics scenes, validate equations and export dimensions, capture render logs and disclose supported platforms. No ownership of upstream Manim is asserted. |
| Native build and desktop distribution | Existing distribution assets are referenced in Schedule B, but current builds must be linked to their own source commits. Contracted targets: macOS Apple Silicon, Windows x64, Debian/Ubuntu .deb and Linux .rpm. Verify install, launch, upgrade/rollback and signature or notarization status per target, with build logs and checksums. Architecture coverage beyond these targets requires explicit acceptance evidence. |

### C.4 AIComposer / FlowArt - visual creation and canvas guidance

| Capability | Scope and required acceptance evidence |
|---|---|
| Four-step guidance state machine | Located: Intent -> Style -> Visual Language -> Confirm Prompt in the creative guide, with associated style/brief and character-plan components. Test forward/back transitions, required-field validation, prompt preview, confirmation, cancellation, state persistence scope and character/reference constraints. Delivery must identify each modified file and its provenance. |
| Multi-model visual styling | Cyber-Ukiyo-e and other complex styling are seller-proposed style/prompt workflows subject to demonstration. Identify presets, provider versions, reference assets and rights; produce an agreed sample set with reproducible request records. Artistic labels are descriptive, not exclusivity claims over a style. Model outputs, third-party images and service access are not automatically owned or transferred with the application code. |

### C.5 DataFlash and FlowPy - DAG and local execution

| Capability | Scope and required acceptance evidence |
|---|---|
| React Flow visual DAG orchestration | Proposed / unverified in this limited review. Identify node types, edge validation, cycle policy, scheduling, retries, cancellation, persistence and logging. Test agreed branching, failure propagation, rerun and deterministic-order cases. React Flow and related dependencies remain subject to their own licenses. |
| Local sandboxed Python execution | Proposed / unverified. Specify the actual isolation boundary, OS/process/container mechanism, filesystem and network policy, resource/time limits, secret handling and escape tests. Running a local subprocess alone is not represented as a security sandbox. Accept only the threat model and isolation controls demonstrated in the signed environment. |

### C.6 MyIME and Astra AI Browser - native and privacy-oriented tools

| Capability | Scope and required acceptance evidence |
|---|---|
| MyIME offline input-source integration | Proposed / unverified. Identify the macOS TISInputSource integration, supported macOS versions and languages, installation/enablement behavior and data storage. Test an offline input corpus and monitor outbound traffic under an agreed network-capture method. OS frameworks are Apple-controlled components and are not transferred as proprietary ZenSuite IP. |
| Astra AI Browser Swift multimodal runtime | Proposed / unverified. Identify native and embedded browser components, model-provider integration, permissions, storage, isolation and remote-processing paths. Deliver a data-flow map and privacy/network tests. "Privacy-first" is a design objective; workflows using cloud models must disclose external transmission. Upstream browser engines, trademarks and framework redistribution rights are separately evaluated. |

**C.7 Final acceptance sheet.** Attach the final test corpus, input hashes, toolchain versions, exact supported environments, functional thresholds, performance limits, security assumptions, known defects, responsible reviewers and an acceptance/rejection record. The parties shall sign this sheet. No untested performance or compliance claim is incorporated through a marketing description.

## Schedule D - Open-source, prior grants and exclusions

The following is a minimum disclosure starter, not a complete SBOM or an exhaustive legal clearance report. The final schedule must be generated from the exact delivery snapshot and its transitive dependencies.

| Identified item or category | Treatment required before proprietary deployment or buyout |
|---|---|
| ZenOffice upstream GenOffice / Mainfunc material | Preserve the applicable upstream Apache-2.0 terms, copyright and notices. Only identified Controlled IP is separately licensed or assigned. The upstream `ee/` directory retains its separate terms and is excluded unless valid independent authorization is documented. |
| ZenOffice gongwen package | The inspected package includes an MIT notice naming mizzlelover. Preserve that notice and establish the boundary of later contributions. No sole authorship over the original package is represented. |
| AIComposer upstream Compositor / Wonder Assembly LLC | Preserve the applicable MIT copyright and permission notice. Limit the commercial offer and any attribution waiver to rights actually controlled by the Licensor. |
| ZenCode upstream and contributions | The prior root Apache-2.0 text and existing notices were preserved. Complete contributor, employer and dependency diligence before any exclusive license or assignment. The Tier C commercial-only six-gate harness must be identified by exact source and delivery manifest and pass the Schedule C.3 acceptance gates. |
| MyIME, Astra AI Browser, DataFlash and FlowPy | Module descriptions in this document do not establish clean title. Generate exact per-file and dependency inventories, verify contributor rights and obtain any required consents before granting proprietary rights beyond existing permissions. |
| Copyleft components, if identified | Separately assess GPL/AGPL/LGPL and other obligations for the intended architecture and distribution. Obtain valid alternate rights, comply, replace or exclude affected material. The Licensor cannot waive another author's copyleft conditions. |
| Fonts, standards, models, datasets and media | List license versions, redistribution conditions, attribution, commercial-use limits and provenance. A software license does not confer ownership of a standard, artistic style or third-party model output. |
| Public GPL releases and previous recipients | Earlier valid grants survive. Record relevant source Tags, commit hashes and dates. An exclusive assignment remains subject to these grants and does not prevent lawful use or redistribution of previous GPL versions. |
| Marks, credentials and third-party services | Excluded unless expressly transferable and scheduled. Access fees, accounts and API credits are separately procured. No upstream brand or signing identity is included by implication. |

## Schedule E - Execution and closing checklist

Before signature: verify both legal identities and signatory authority; select the exact tier; complete price, term, scope, payment and notice particulars; attach and countersign the rights, exclusions and acceptance schedules; identify required escrow agents; and obtain review by qualified counsel for the applicable parties and jurisdictions.

Before a Tier C closing: verify title and contributor/employer consents; resolve or expressly exclude upstream restrictions; document prior GPL grants; verify source and artifact hashes; complete Acceptance; exchange executed assignment instruments and lawful account-transfer documents; authorize escrow disbursement; and record the Closing date. Future rights or unbuilt functionality are not silently deemed delivered.

## Execution page

By signing below, each authorized signatory agrees to this Agreement and the completed, attached schedules. The parties acknowledge the rights boundary, surviving open-source grants and the distinction between a perpetual license and an assignment. Any unsigned or blank commercial selection remains unagreed.

**LICENSOR**

Legal name / capacity: __________________________________________________

Registration or identity reference: _________________________________________

Authorized signatory and title: ____________________________________________

Signature: ______________________________  Date: ________________________

Registered / notice address: ______________________________________________

Email: macdevsh@gmail.com  |  Additional notice email: ______________________

**LICENSEE**

Legal name: __________________________________________________________

Registration number: __________________________________________________

Authorized signatory and title: ____________________________________________

Signature: ______________________________  Date: ________________________

Registered / notice address: ______________________________________________

Notice email: _________________________________________________________

**Attached schedules and version references accepted by both parties:**

Schedule A: __________________  Schedule B: __________________

Schedule C: __________________  Schedule D: __________________

Additional instruments / closing schedule: __________________________________

End of Agreement.
