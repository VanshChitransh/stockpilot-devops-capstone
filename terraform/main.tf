data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # first two AZs in the region -> 2 public + 2 private subnets
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

# ---------------------------------------------------------------------------
# Network: VPC, 2 public subnets (load balancers, NAT), 2 private subnets (nodes)
# ---------------------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.21.0"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  public_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 100)] # 10.30.100.0/24, 10.30.101.0/24
  private_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i)]       # 10.30.0.0/24,   10.30.1.0/24

  # one NAT gateway instead of one per AZ: cheaper, but a single point of failure.
  # fine for a course project, not for production
  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
  enable_dns_support   = true

  # these tags are how the AWS load balancer integration finds where to put LBs
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# ---------------------------------------------------------------------------
# EKS control plane + one managed node group in the private subnets
# ---------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.37.1"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # public API endpoint so kubectl / GitHub Actions can reach it
  cluster_endpoint_public_access = true
  # whoever runs `terraform apply` becomes cluster admin
  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    coredns                = {}
    kube-proxy             = {}
    vpc-cni                = {}
    eks-pod-identity-agent = {}
    # needed for PersistentVolumeClaims (postgres data) on EKS
    aws-ebs-csi-driver = {
      service_account_role_arn = module.ebs_csi_irsa.iam_role_arn
      configuration_values = jsonencode({
        defaultStorageClass = { enabled = true }
      })
    }
  }

  eks_managed_node_groups = {
    default = {
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"

      min_size     = var.node_min_size
      desired_size = var.node_desired_size
      max_size     = var.node_max_size

      labels = {
        workload = "stockpilot"
      }
    }
  }
}

# IAM role the EBS CSI driver assumes (IRSA) to create/attach EBS volumes
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "5.55.0"

  role_name             = "${var.cluster_name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}
