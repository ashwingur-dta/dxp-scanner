#!/usr/bin/env bash
set -euo pipefail

STACK="${STACK:-dxp-scanner}"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
DEPLOY_BUCKET="${DEPLOY_BUCKET:-dxp-deploy-${ACCOUNT}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

echo "==> account ${ACCOUNT} · region ${REGION} · stack ${STACK}"

echo "==> ensuring deployment bucket ${DEPLOY_BUCKET}"
if ! aws s3api head-bucket --bucket "$DEPLOY_BUCKET" 2>/dev/null; then
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$DEPLOY_BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$DEPLOY_BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  fi
fi

echo "==> building lambda bundles"
node scripts/build.mjs

STAMP="$(date +%Y%m%d%H%M%S)"
API_KEY="lambda/api-${STAMP}.zip"
WORKER_KEY="lambda/worker-${STAMP}.zip"

echo "==> uploading bundles"
aws s3 cp dist/api.zip "s3://${DEPLOY_BUCKET}/${API_KEY}" --only-show-errors
aws s3 cp dist/worker.zip "s3://${DEPLOY_BUCKET}/${WORKER_KEY}" --only-show-errors

echo "==> deploying stack (this creates a CloudFront distribution the first time, ~5 min)"
aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file infra/template.yaml \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "ApiCodeBucket=${DEPLOY_BUCKET}" \
    "ApiCodeKey=${API_KEY}" \
    "WorkerCodeKey=${WORKER_KEY}" \
    "MaxPages=${MAX_PAGES:-6}" \
    "RateLimit=${RATE_LIMIT:-0}" \
    "RateWindowSeconds=${RATE_WINDOW_SECONDS:-600}" \
    "DedupeSeconds=${DEDUPE_SECONDS:-60}" \
    "WafRateLimit=${WAF_RATE_LIMIT:-2000}"

get_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

SITE_BUCKET="$(get_output SiteBucketName)"
SITE_URL="$(get_output SiteUrl)"
DIST_ID="$(get_output DistributionId)"

echo "==> building and publishing the web app"
npm run build:web --silent
aws s3 sync apps/web/dist "s3://${SITE_BUCKET}" --delete --only-show-errors \
  --cache-control 'public, max-age=300'
aws s3 cp "apps/web/dist/index.html" "s3://${SITE_BUCKET}/index.html" --only-show-errors \
  --cache-control 'no-cache' --content-type 'text/html; charset=utf-8'

echo "==> invalidating cache"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.Id' --output text >/dev/null

cat <<EOF

Deployed.

  Public URL   ${SITE_URL}
  API health   ${SITE_URL}/api/health
  Rubric       ${SITE_URL}/api/rubric

A new CloudFront distribution takes a few minutes to propagate before it serves.
EOF
