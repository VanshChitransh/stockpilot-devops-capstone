# Terraform: AWS VPC + EKS

Provisions the AWS side of StockPilot in `ap-south-1` (Mumbai):

```text
VPC 10.30.0.0/16
├── public subnets   10.30.100.0/24, 10.30.101.0/24   (2 AZs) → internet gateway, NAT gateway, load balancers
├── private subnets  10.30.0.0/24,   10.30.1.0/24     (2 AZs) → worker nodes (no public IPs)
├── 1 NAT gateway (single, to keep cost down)
└── EKS cluster "stockpilot-eks" (Kubernetes 1.34)
    ├── managed node group: 2 × t3.medium (scales 2-4)
    ├── add-ons: coredns, kube-proxy, vpc-cni, pod-identity-agent, aws-ebs-csi-driver
    └── IRSA role for the EBS CSI driver (so the postgres PVC can get an EBS volume)
```

| File | What it holds |
|------|---------------|
| `versions.tf` | Terraform + AWS provider versions, provider config, default tags |
| `variables.tf` | Every tunable (region, names, CIDR, node sizes) |
| `main.tf` | VPC module, EKS module, IRSA role for EBS CSI |
| `outputs.tf` | Cluster name/endpoint, VPC + subnet IDs, the kubeconfig command |
| `terraform.tfvars.example` | Example inputs, copy to `terraform.tfvars` (gitignored) |

## Run it

Credentials come from your AWS CLI profile or environment, never from these files.

```bash
aws configure            # or: aws login / export AWS_PROFILE=...
cd terraform
cp terraform.tfvars.example terraform.tfvars

terraform init           # downloads the aws provider + the vpc/eks/iam modules
terraform fmt -check
terraform validate
terraform plan -out tfplan
terraform apply tfplan   # ~15 min, EKS control plane is the slow part

# point kubectl at the new cluster (exact command is also a terraform output)
aws eks update-kubeconfig --region ap-south-1 --name stockpilot-eks
kubectl get nodes
```

Then install the cluster add-ons and the app:

```bash
cd ..
./scripts/install-addons.sh eks          # ingress-nginx (AWS LB), metrics-server, prometheus+grafana
helm upgrade --install stockpilot ./helm/stockpilot -n stockpilot \
  -f helm/stockpilot/values-prod.yaml \
  --set backend.tag=<git sha> --set frontend.tag=<git sha> \
  --set-string postgres.password='<something strong>'
kubectl get svc -n ingress-nginx ingress-nginx-controller   # EXTERNAL-IP = app URL
```

To let GitHub Actions deploy here instead of to its throwaway kind cluster, set in the repo settings:

- variable `EKS_CLUSTER_NAME` = `stockpilot-eks`
- secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (an IAM user with EKS access), optionally `DB_PASSWORD`
- make the two GHCR packages public (Package settings → Change visibility), or add an `imagePullSecret`

## No AWS account? Run it against LocalStack

```bash
./scripts/terraform-localstack.sh plan                       # 62 to add (VPC + EKS)
./scripts/terraform-localstack.sh apply -target=module.vpc   # VPC, subnets, NAT, routes
./scripts/terraform-localstack.sh aws ec2 describe-vpcs      # aws cli against the emulator
./scripts/terraform-localstack.sh destroy
./scripts/terraform-localstack.sh down                       # remove the emulator container
```

The script points the provider at LocalStack (`localhost:4566`, dummy credentials) through a temporary `localstack_override.tf`, and keeps state in a separate `localstack` workspace. None of the `.tf` files change.

LocalStack's free edition emulates EC2/VPC, IAM, STS, KMS and CloudWatch Logs, but not EKS. A full `apply` therefore creates everything up to the cluster (IAM roles, KMS key, log group, security groups) and then fails at `CreateCluster` with HTTP 501. It's pinned to `localstack/localstack:4.14`, the last community release that runs without an account token.

## Tear it down

```bash
helm uninstall stockpilot -n stockpilot
helm uninstall ingress-nginx -n ingress-nginx   # removes the AWS load balancer first, or the VPC can't be deleted
kubectl delete pvc --all -n stockpilot          # releases the EBS volume
terraform destroy
```

## Cost

Approximate, `ap-south-1`, on-demand: EKS control plane $0.10/h + 2 × t3.medium ~$0.09/h + NAT gateway ~$0.056/h + data. That's **about $6 a day**, so apply, take the screenshots, and destroy.

## Design notes

- **Modules over hand-written resources.** `terraform-aws-modules/vpc` and `/eks` are the community-standard modules. Writing route tables, IAM roles and security groups by hand is roughly 600 lines of code that already exists and is tested.
- **Nodes in private subnets.** Nodes have no public IPs. They reach the internet (GHCR pulls) through the NAT gateway, and only the load balancer sits in the public subnets.
- **Single NAT gateway.** A NAT gateway per AZ would survive an AZ outage but costs 2×. That's the wrong trade for a course project.
- **Local state.** Fine for one person. For a team, uncomment the S3 backend in `versions.tf` so state is shared and locked.
- **Postgres inside the cluster** (StatefulSet + EBS volume) keeps the project self-contained. In production this would be Amazon RDS: managed backups, failover and patching, at the cost of another Terraform module and more money.
