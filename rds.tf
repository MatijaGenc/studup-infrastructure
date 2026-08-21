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
  storage_type      = "gp2"
  storage_encrypted = true

  username = "postgres"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.default.name
  vpc_security_group_ids = [aws_security_group.lambda_rds.id]

  publicly_accessible = false
  multi_az            = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "studup-dev-final"

  backup_retention_period    = 30
  backup_window              = "05:46-06:16"
  deletion_protection        = true
  auto_minor_version_upgrade = true
  max_allocated_storage      = 1000

  lifecycle {
    ignore_changes = [
      engine_version,
      db_name,
      backup_target,
      ca_cert_identifier,
      customer_owned_ip_enabled,
      database_insights_mode,
      enabled_cloudwatch_logs_exports,
      iam_database_authentication_enabled,
      iops,
      kms_key_id,
      license_model,
      storage_throughput,
      parameter_group_name,
      option_group_name,
      performance_insights_kms_key_id,
      performance_insights_retention_period,
      vpc_security_group_ids,
      password,
    ]
  }

  tags = {
    Name = "studup-dev"
  }
}