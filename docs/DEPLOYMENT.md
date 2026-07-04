# CompanyGraph Deployment Guide

## Prerequisites

- Kubernetes cluster (EKS/GKE/AKS) with kubectl configured
- Helm 3.x installed
- Terraform 1.x installed (for infrastructure provisioning)
- Neo4j cluster deployed and accessible
- Domain name configured for ingress

## Infrastructure Deployment

### 1. Provision Kubernetes Cluster with Terraform

```bash
cd terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### 2. Configure kubectl

```bash
aws eks update-kubeconfig --region us-east-1 --name companygraph-prod
```

### 3. Install Monitoring Stack (Optional)

```bash
# Add Prometheus Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus and Grafana
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

## Application Deployment

### 1. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 2. Configure Secrets

**Option A: Kubernetes Secrets (Development)**
```bash
kubectl apply -f k8s/secrets.yaml
```

**Option B: Sealed Secrets (Production)**
```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Seal your secrets
kubeseal -f k8s/secrets.yaml -w k8s/sealed-secrets.yaml --cert-file sealed-secrets-cert.pem

# Apply sealed secrets
kubectl apply -f k8s/sealed-secrets.yaml
```

### 3. Deploy Application with Helm

```bash
cd helm/companygraph
helm install companygraph . -n companygraph-prod --create-namespace
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n companygraph-prod

# Check services
kubectl get svc -n companygraph-prod

# Check HPA
kubectl get hpa -n companygraph-prod

# Check logs
kubectl logs -n companygraph-prod -l app=companygraph-api --tail=100
```

## Upgrades

### Application Upgrade

```bash
helm upgrade companygraph . -n companygraph-prod
```

### Rollback

```bash
helm rollback companygraph -n companygraph-prod
```

## Monitoring

### Access Grafana

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
```

Access at http://localhost:3000 (default credentials: admin/prom-operator)

### Access Prometheus

```bash
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
```

Access at http://localhost:9090

## Troubleshooting

### Pod Not Starting

```bash
kubectl describe pod <pod-name> -n companygraph-prod
kubectl logs <pod-name> -n companygraph-prod
```

### Database Connection Issues

```bash
# Check Neo4j connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- sh
curl -v bolt://neo4j:7687
```

### High Memory/CPU Usage

```bash
# Check resource usage
kubectl top pods -n companygraph-prod
kubectl top nodes

# Check HPA status
kubectl describe hpa companygraph-api-hpa -n companygraph-prod
```

## Scaling

### Manual Scaling

```bash
kubectl scale deployment companygraph-api -n companygraph-prod --replicas=10
```

### Adjust HPA

Edit values.yaml and upgrade:
```bash
helm upgrade companygraph . -n companygraph-prod
```

## Disaster Recovery

### Backup

```bash
# Backup Helm release
helm get values companygraph -n companygraph-prod > backup-values.yaml

# Backup Kubernetes resources
kubectl get all -n companygraph-prod -o yaml > backup-resources.yaml
```

### Restore

```bash
helm install companygraph . -n companygraph-prod -f backup-values.yaml
```
