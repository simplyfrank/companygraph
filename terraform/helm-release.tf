# Helm release for CompanyGraph

resource "helm_release" "companygraph" {
  name       = "companygraph"
  repository = "oci://ghcr.io/companygraph/charts"
  chart      = "companygraph"
  namespace  = "companygraph-prod"
  version    = "0.1.0"

  create_namespace = true

  values = [
    templatefile("${path.module}/helm-values.yaml", {
      neo4j_uri     = var.neo4j_uri
      neo4j_user    = var.neo4j_user
      neo4j_password = var.neo4j_password
    })
  ]

  depends_on = [module.eks]
}

variable "neo4j_uri" {
  description = "Neo4j connection URI"
  type        = string
  sensitive   = true
}

variable "neo4j_user" {
  description = "Neo4j username"
  type        = string
  default     = "neo4j"
  sensitive   = true
}

variable "neo4j_password" {
  description = "Neo4j password"
  type        = string
  sensitive   = true
}
