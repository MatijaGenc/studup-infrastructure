resource "aws_db_subnet_group" "default" {
  name        = "default-vpc-07269dbd3168692b5"
  description = "Created from the RDS Management Console"
  subnet_ids  = local.subnet_ids
}

resource "aws_db_instance" "dev" {
  identifier        = "dev"
  engine            = "postgres"
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  username = "postgres"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.default.name
  vpc_security_group_ids = [aws_security_group.lambda_rds.id]

  publicly_accessible       = false
  multi_az                  = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "studup-dev-final"

  backup_retention_period    = 30
  backup_window              = "05:46-06:16"
  deletion_protection        = true
  auto_minor_version_upgrade = true
  max_allocated_storage      = 1000

  lifecycle {
    ignore_changes = [
      # RDS log exports and IAM database authentication were enabled in the
      # console and remain console-owned. Owner: platform owner.
      enabled_cloudwatch_logs_exports,
      iam_database_authentication_enabled,
      # Extra security groups may be attached from the console; Terraform owns
      # only the primary attachment. Owner: platform owner.
      vpc_security_group_ids,
      # RDS master password is rotated every 30 days by the rotation Lambda.
      # Owner: security owner / studup-db-password-rotation.
      password,
      # ForceNew attributes inherited from the console-created instance. They
      # are Optional+Computed, so omitting them normally produces no diff, but
      # keeping the ignore guarantees the narrowed list cannot plan a
      # replacement. Remove after an owner-reviewed plan/import. Owner:
      # platform owner.
      db_name,
      backup_target,
      kms_key_id,
    ]
  }

  tags = {
    Name = "studup-dev"
  }
}