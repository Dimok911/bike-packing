# Arkel weight-source correction, 2026-09-27

BB Packer's visible technical specification says 240 g; Shopify inventory grams says 318. The importer used the visible number at model level but inventory grams in variants. The same inconsistency affected other Arkel models.

Fetched all 43 current collection product pages and rebuilt 62 catalog models. Visible manufacturer metafields now supply weights by capacity, named size, individual/pair configuration and bag/hanger components. Metric values take precedence over the often inconsistent rounded imperial values printed beside them. 61 models have a visible matching specification. Heavy Duty Tote has no visible weight specification: its previous approved weight is preserved, with missing evidence recorded, instead of replacing it with inventory grams. Gallery handling and the published catalog are unchanged.

The new Arkel-only report combines the existing non-weight proposals, corrected weights, and all 29 existing photo-review proposals. BB Packer is no longer a change; Bug remains a new model. Other manufacturers keep their original scans and decisions. Old reports and decisions are retained; corrected proposals require review again, including any previously approved wrong weights.

Regression fixtures cover all 62 models, reversed size order, leading-decimal volumes, pair totals, component totals, a conflicting hidden Shopify weight, and unavailable specifications. Scanner-only change: no frontend deployment or catalog publication is required. The monthly workflow pin must point to this checked commit.
