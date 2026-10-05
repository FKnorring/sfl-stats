# Auto-link exact-score ties in player Matching; flag fuzzy-score ties for review

When Matching scores a Demo player's name against multiple Roster Entry candidates and two or more tie for the best score, the outcome depends on whether that tied score is exact (1.0, normalized names are identical) or fuzzy (<1.0, similar but not identical).

- **Exact ties (score = 1.0):** auto-link all tied Roster Entries to the same Player. The reasoning: a normalized-identical nickname recurring across multiple Roster Entries is overwhelmingly the same real person reusing their tag across seasons/teams, not two different people who happen to share a nickname.
- **Fuzzy ties (score < 1.0):** always Needs Review, never auto-linked. Two different people with similarly-misspelled or similar nicknames is a real risk at fuzzy similarity, so guessing is unsafe.

We considered applying the same confidence-threshold logic uniformly regardless of tie type, but that would either auto-link genuinely ambiguous fuzzy ties (risking cross-wiring two different players' stats) or force manual review on the common, safe case of a recurring exact nickname. Splitting the behavior by exactness was chosen as the correct tradeoff between automation and safety.
