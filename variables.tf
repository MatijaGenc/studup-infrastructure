variable "db_password" {
  description = "RDS PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "email_api_key" {
  description = "Brevo/Sendinblue email API key"
  type        = string
  sensitive   = true
}

variable "email_from_address" {
  description = "From email address"
  type        = string
  default     = "up.stud.up@gmail.com"
}

variable "support_email" {
  description = "Support email address"
  type        = string
  default     = "stud.up.podrska@gmail.com"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_s3_key" {
  description = "S3 key for Lambda deployment zip"
  type        = string
  default     = "lambdas/DataHandler.zip"
}