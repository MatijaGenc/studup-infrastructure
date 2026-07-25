output "lambda_function_name" {
  value = aws_lambda_function.data_handler.function_name
}

output "lambda_role_arn" {
  value = aws_iam_role.lambda.arn
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.studup.domain_name
}

output "website_bucket" {
  value = aws_s3_bucket.website.id
}

output "profile_images_bucket" {
  value = aws_s3_bucket.profile_images.id
}

output "rds_endpoint" {
  value = aws_db_instance.dev.endpoint
}

output "api_gateway_openapi_url" {
  value = "${aws_api_gateway_domain_name.openapi.regional_domain_name}/open-api"
}

output "api_gateway_userapi_url" {
  value = "${aws_api_gateway_domain_name.userapi.regional_domain_name}/data-api"
}

output "route53_zone_id" {
  value = aws_route53_zone.studup.zone_id
}