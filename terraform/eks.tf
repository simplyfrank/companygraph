# EKS Cluster configuration

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  # Addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  # EKS Managed Node Groups
  eks_managed_node_groups = {
    main = {
      name           = "main"
      instance_types = [var.instance_type]

      min_size     = 3
      max_size     = 20
      desired_size = var.node_count

      capacity_type  = var.enable_spot_instances ? "SPOT" : "ON_DEMAND"
      instance_types = var.enable_spot_instances ? ["c5.2xlarge", "c5a.2xlarge", "m5.2xlarge"] : [var.instance_type]

      labels = {
        role = "worker"
      }

      taints = []

      tags = {
        Name = "${var.cluster_name}-worker"
      }
    }
  }

  # Cluster security group rules
  cluster_security_group_additional_rules = {
    ingress_nodes_ephemeral_ports_tcp = {
      description                = "Nodes on ephemeral ports"
      protocol                   = "tcp"
      from_port                 = 1025
      to_port                   = 65535
      type                      = "ingress"
      source_node_security_group = true
    }
  }

  # Node security group rules
  node_security_group_additional_rules = {
    ingress_self_all = {
      description = "Node to node all ports/protocols"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }
  }

  tags = {
    Environment = "production"
    Terraform   = "true"
  }
}
