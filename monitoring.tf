resource "aws_sns_topic" "alarms" {
  name = "studup-alarms"
}

resource "aws_sns_topic_subscription" "alarms_email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = "tosic.danieldt@gmail.com"
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  alarm_name          = "studup-api-gateway-5xx-data-api"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "data-api 5XX errors exceeded threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ApiName = aws_api_gateway_rest_api.data_api.name
    Stage   = aws_api_gateway_stage.data_api.stage_name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx_dta" {
  alarm_name          = "studup-api-gateway-5xx-dta-api"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "dta-api 5XX errors exceeded threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ApiName = aws_api_gateway_rest_api.dta_api.name
    Stage   = aws_api_gateway_stage.dta_api.stage_name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx_open" {
  alarm_name          = "studup-api-gateway-5xx-open-api"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "open-api 5XX errors exceeded threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ApiName = aws_api_gateway_rest_api.open_api.name
    Stage   = aws_api_gateway_stage.open_api.stage_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "studup-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "3"
  alarm_description   = "Lambda function errors exceeded threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = aws_lambda_function.data_handler.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "rotation_lambda_errors" {
  alarm_name          = "studup-rotation-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "DB password rotation Lambda errors"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = aws_lambda_function.db_password_rotation.function_name
  }
}

resource "aws_cloudwatch_log_metric_filter" "health_check_failure" {
  name           = "studup-health-check-failure"
  pattern        = "Health check failed"
  log_group_name = "/aws/lambda/DataHandler"

  metric_transformation {
    name      = "HealthCheckFailure"
    namespace = "StudUp"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "health_check_failure" {
  alarm_name          = "studup-health-check-failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HealthCheckFailure"
  namespace           = "StudUp"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Health check endpoint returned 503 (database unreachable)"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "studup-rds-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "RDS CPU utilization exceeded 80% for 10 minutes"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.dev.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "studup-rds-database-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "60"
  alarm_description   = "RDS database connections approach max_connections (t3.micro default 85)"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.dev.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "studup-rds-free-storage-space"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "5368709120"
  unit                = "Bytes"
  alarm_description   = "RDS free storage space below 5GB"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.dev.identifier
  }
}