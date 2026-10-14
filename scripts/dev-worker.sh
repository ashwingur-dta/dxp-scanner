#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://www.digital.gov.au/policy/digital-experience}"
REGION="${AWS_REGION:-us-east-1}"
FN="${WORKER_FN:-dxp-worker-dxp-scanner}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
DEPLOY_BUCKET="dxp-deploy-${ACCOUNT}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> build"
node scripts/build.mjs >/dev/null

KEY="dev/worker-$(date +%s).zip"
echo "==> upload + update function code"
aws s3 cp dist/worker.zip "s3://${DEPLOY_BUCKET}/${KEY}" --only-show-errors
aws lambda update-function-code --function-name "$FN" --region "$REGION" \
  --s3-bucket "$DEPLOY_BUCKET" --s3-key "$KEY" --query 'LastModified' --output text
aws lambda wait function-updated --function-name "$FN" --region "$REGION"

JOB="dev$(date +%s)"
PAYLOAD=$(printf '{"Records":[{"messageId":"m1","body":"{\\"jobId\\":\\"%s\\",\\"url\\":\\"%s\\"}"}]}' "$JOB" "$URL")

echo "==> invoke (job $JOB)"
aws lambda invoke --function-name "$FN" --region "$REGION" \
  --cli-binary-format raw-in-base64-out --payload "$PAYLOAD" \
  --cli-read-timeout 900 /tmp/dev-worker-out.json --query 'StatusCode' --output text
echo "--- response ---"; cat /tmp/dev-worker-out.json; echo

echo "==> job record"
aws dynamodb get-item --table-name "dxp-jobs-dxp-scanner" --region "$REGION" \
  --key "{\"job_id\":{\"S\":\"$JOB\"}}" \
  --query 'Item.{status:status.S,phase:phase.S,bundle:bundle_id.S,err:error.S}' --output json

BUNDLE=$(aws dynamodb get-item --table-name "dxp-jobs-dxp-scanner" --region "$REGION" \
  --key "{\"job_id\":{\"S\":\"$JOB\"}}" --query 'Item.bundle_id.S' --output text 2>/dev/null || echo None)

if [ "$BUNDLE" != "None" ] && [ -n "$BUNDLE" ]; then
  EV="dxp-evidence-${ACCOUNT}"
  SITE=$(aws dynamodb get-item --table-name "dxp-jobs-dxp-scanner" --region "$REGION" \
    --key "{\"job_id\":{\"S\":\"$JOB\"}}" --query 'Item.site_id.S' --output text 2>/dev/null || echo '')
  for S in "$SITE" digital; do
    if aws s3 cp "s3://${EV}/site-runs/${S}/${BUNDLE}/bundle.json.gz" /tmp/dev-bundle.json.gz --only-show-errors 2>/dev/null; then
      gunzip -f /tmp/dev-bundle.json.gz
      node -e '
        const b = require("/tmp/dev-bundle.json");
        console.log(`pages=${b.pages.length} skipped=${b.skipped.length}`);
        for (const p of b.pages) {
          console.log(`  OK   ${p.status} words=${p.main_word_count} ${JSON.stringify(p.integrity.reasons)} ${p.final_url}`);
        }
        for (const s of b.skipped.slice(0, 5)) {
          console.log(`  SKIP ${s.url}\n       ${s.reason.split("\n")[0]}`);
        }
      '
      break
    fi
  done
fi
