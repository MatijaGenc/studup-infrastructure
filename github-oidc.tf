locals {
  aws_region               = "eu-south-1"
  github_repository_prefix = "repo:MatijaGenc"
  github_oidc_audience     = "sts.amazonaws.com"
  backend_functions = [
    "DataHandler",
    "studup-db-migrator",
  ]
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = [local.github_oidc_audience]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]

  tags = {
    Name = "github-actions"
  }
}

data "aws_iam_policy_document" "github_backend_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = [local.github_oidc_audience]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_repository_prefix}/student-employer-backend:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_backend_deploy" {
  name               = "studup-github-backend-deploy"
  description        = "GitHub Actions deploy role for the StudUp backend (main branch only)"
  assume_role_policy = data.aws_iam_policy_document.github_backend_assume.json

  tags = {
    Name = "studup-github-backend-deploy"
  }
}

data "aws_iam_policy_document" "github_backend_deploy" {
  statement {
    effect = "Allow"
    actions = [
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
    ]
    resources = [
      for function_name in local.backend_functions :
      "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:${function_name}"
    ]
  }

  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:studup-db-migrator"]
  }
}

resource "aws_iam_role_policy" "github_backend_deploy" {
  name   = "studup-github-backend-deploy"
  role   = aws_iam_role.github_backend_deploy.id
  policy = data.aws_iam_policy_document.github_backend_deploy.json
}

data "aws_iam_policy_document" "github_frontend_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = [local.github_oidc_audience]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_repository_prefix}/student-employer-frontend:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_frontend_deploy" {
  name               = "studup-github-frontend-deploy"
  description        = "GitHub Actions deploy role for the StudUp frontend (main branch only)"
  assume_role_policy = data.aws_iam_policy_document.github_frontend_assume.json

  tags = {
    Name = "studup-github-frontend-deploy"
  }
}

data "aws_iam_policy_document" "github_frontend_deploy" {
  statement {
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::studup-website"]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["arn:aws:s3:::studup-website/*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/E3QIPLNGFSS6DH"]
  }
}

resource "aws_iam_role_policy" "github_frontend_deploy" {
  name   = "studup-github-frontend-deploy"
  role   = aws_iam_role.github_frontend_deploy.id
  policy = data.aws_iam_policy_document.github_frontend_deploy.json
}
