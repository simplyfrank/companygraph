# /deploy - Deploy via CI/CD Pipeline

> **⚠️ STALE STACK — ported from personalassistant, not yet rewired for companygraph.** Describes the personalassistant CodePipeline + Telegram prod-approval flow. companygraph has no deploy pipeline; CI is GitHub Actions gating PRs only. Reconcile against this repo before following any instruction below.

All deployments go through the CodePipeline CI/CD pipeline with staging/production promotion. **NEVER run deploy scripts directly.**

## Usage

- `/deploy` — Commit, push to `main`, then monitor pipeline
- `/deploy check` — Transpile check only (local, no deploy)
- `/deploy status` — Check pipeline status (all 6 stages)
- `/deploy approve` — Approve production promotion
- `/deploy testflight` — Build and upload iOS app to TestFlight (local only)
- `/deploy testflight --skip-upload` — Archive and export only (no upload)

## Pipeline Stages

```
Source → Build & Test → Deploy Staging → Smoke Test → Approve Prod → Promote Prod
```

1. **Source** — Triggered on push to `main`
2. **Build** — Change detection, transpile checks, tests
3. **DeployStaging** — Auto-deploy changed components (EC2 via SSM, PWA via S3, Lambda)
4. **SmokeTest** — Automated health checks (EC2 endpoints, PWA reachability, Lambda state)
5. **ApproveProd** — Manual approval (Telegram notification sent)
6. **PromoteProd** — Publish Lambda version, send production-confirmed notification

## Execution Protocol

### 1. Transpile Check (always first)

```bash
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun build src/cloud/relay.ts --no-bundle > /dev/null 2>&1 && echo "BUILD OK" || echo "BUILD FAILED"
```

If build fails, fix errors before proceeding. Common issues:
- Missing imports (check file exists)
- Type mismatches (Bun transpiler catches these)
- Circular imports (split into separate files)

### 2. Deploy (CI/CD Pipeline)

**Block instruction**: NEVER run `deploy-cloud.sh`, `deploy-pwa.sh`, `deploy-myndshare-cloud.sh`, or `deploy-myndshare-pwa.sh` directly. All deployments go through the CI/CD pipeline.

```bash
# Stage, commit, and push to main
cd /Users/frank/Documents/coding/personalassistant
git add -A && git commit -m "deploy: <description>" && git push origin main
```

The pipeline automatically:
1. Detects changed components (cloud-bot, PWA, myndshare, Lambda)
2. Builds and packages artifacts
3. Deploys to staging (EC2 via SSM, PWA via S3/CloudFront, Lambda)
4. Runs automated smoke tests (health checks)
5. Sends Telegram notification asking for production approval
6. After approval, finalizes production (Lambda version, confirmation)

### 3. Monitor Pipeline

```bash
# Quick stage overview
aws codepipeline get-pipeline-state --name personal-assistant-pipeline --region ap-southeast-1 --query 'stageStates[*].{Stage:stageName,Status:latestExecution.status}' --output table

# Detailed status with action-level timing
aws codepipeline get-pipeline-state --name personal-assistant-pipeline --region ap-southeast-1 --query 'stageStates[*].{Stage:stageName,Status:latestExecution.status,Actions:actionStates[*].{Action:actionName,Status:latestExecution.status,LastChanged:latestExecution.lastStatusChange}}' --output json
```

### 4. Approve Production

After staging deploy and smoke tests pass, approve to promote to production:

```bash
aws codepipeline put-approval-result \
  --pipeline-name personal-assistant-pipeline \
  --stage-name ApproveProd \
  --action-name ManualApproval \
  --result "summary=Approved,status=Approved" \
  --region ap-southeast-1
```

### 5. Reject (Rollback)

If staging looks bad, reject to stop the pipeline:

```bash
aws codepipeline put-approval-result \
  --pipeline-name personal-assistant-pipeline \
  --stage-name ApproveProd \
  --action-name ManualApproval \
  --result "summary=Rejected,status=Rejected" \
  --region ap-southeast-1
```

Then trigger a rollback by reverting the commit:

```bash
git revert HEAD --no-edit && git push origin main
```

### 6. Check Deploy Health

```bash
# Check via SSM
INSTANCE_ID="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw instance_id)"
aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name "AWS-RunShellScript" \
  --parameters 'commands=["curl -s http://localhost:8443/health"]' --region ap-southeast-1
```

Expected: `{"status":"ok",...}`

### 7. TestFlight Deploy (iOS — local only)

```bash
cd /Users/frank/Documents/coding/personalassistant && ./scripts/deploy-testflight.sh
```

Options:
- `--skip-upload` — Archive and export IPA without uploading (dry run)
- `--skip-pwa-sync` — Skip PWA asset sync (use existing www/)
- `--build-number <n>` — Override auto-incremented build number

## Emergency Rollback

### Restart service (no code change)

```bash
INSTANCE_ID="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw instance_id)"
aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo systemctl restart assistant-bot"]' --region ap-southeast-1
```

### Revert to previous deploy

```bash
# Revert the commit and push — pipeline redeploys the previous version
git revert HEAD --no-edit && git push origin main
```

### Manual SSH (last resort)

```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" \
  'sudo systemctl restart assistant-bot && sleep 2 && sudo journalctl -u assistant-bot -n 30 --no-pager'
```

## Telegram Notifications

The pipeline sends Telegram notifications at every key stage:
- **Staging deployed** — after DeployStaging succeeds
- **Smoke tests passed/failed** — after SmokeTest completes
- **Approval request** — when ApproveProd is waiting
- **Production promoted** — after PromoteProd completes with commit + component list
- **Pipeline failed** — on any stage failure

## Common Issues

- **409 Conflict**: Another bot instance polling. Wait 35s (RestartSec) or stop service first.
- **Module not found**: Run `cd ~/app && bun install` on EC2 via SSM.
- **Secrets missing**: Check `aws secretsmanager get-secret-value --secret-id personal-assistant/bot --region ap-southeast-1`.
- **Agent not connecting**: Verify AGENT_SECRET matches between local .env and Secrets Manager.
- **Pipeline stuck at approval**: Run `/deploy approve` or reject and rollback.
- **Smoke test failed**: Check CodeBuild logs for which health check failed. May need manual SSM investigation.
- **SSM agent not online**: Wait ~2 min after terraform apply for agent registration. Check IAM role has `AmazonSSMManagedInstanceCore` policy.
