import json
import logging
import os
import secrets
import string

import boto3
import pg8000
from pg8000.native import literal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

secrets_client = boto3.client("secretsmanager")

DB_HOST = os.environ.get("DB_HOST", "dev.cwkb6xgemtnz.eu-south-1.rds.amazonaws.com")
DB_PORT = int(os.environ.get("DB_PORT", "5432"))
DB_USER = os.environ.get("DB_USER", "postgres")
DB_NAME = os.environ.get("DB_NAME", "postgres")


def generate_password(length=32):
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
        ):
            return password


def get_connection(password):
    return pg8000.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=password,
        database=DB_NAME,
    )


def lambda_handler(event, context):
    arn = event["SecretId"]
    token = event["ClientRequestToken"]
    step = event["Step"]

    metadata = secrets_client.describe_secret(SecretId=arn)
    if not metadata["RotationEnabled"]:
        raise ValueError(f"Secret {arn} is not enabled for rotation")

    version_ids = list(metadata["VersionIdsToStages"].keys())
    if token not in version_ids:
        raise ValueError(
            f"Rotation token {token} not found in secret {arn}"
        )

    if metadata["VersionIdsToStages"].get(token, []) == ["AWSCURRENT"]:
        logger.info("Secret %s is already set to AWSCURRENT", arn)
        return

    if step == "createSecret":
        _create_secret(arn, token)
    elif step == "setSecret":
        _set_secret(arn, token)
    elif step == "testSecret":
        _test_secret(arn, token)
    elif step == "finishSecret":
        _finish_secret(arn, token)
    else:
        raise ValueError(f"Invalid step {step}")


def _get_current_password(arn):
    response = secrets_client.get_secret_value(
        SecretId=arn, VersionStage="AWSCURRENT"
    )
    return response["SecretString"]


def _create_secret(arn, token):
    try:
        secrets_client.get_secret_value(
            SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
        )
        logger.info("createSecret: AWSPENDING version %s already exists", token)
        return
    except secrets_client.exceptions.ResourceNotFoundException:
        pass

    new_password = generate_password()

    secrets_client.put_secret_value(
        SecretId=arn,
        ClientRequestToken=token,
        VersionStages=["AWSPENDING"],
        SecretString=new_password,
    )
    logger.info("createSecret: AWSPENDING version %s created", token)


def _set_secret(arn, token):
    current = _get_current_password(arn)
    pending = secrets_client.get_secret_value(
        SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
    )["SecretString"]

    conn = get_connection(current)
    with conn.cursor() as cur:
        cur.execute(
            "ALTER USER " + DB_USER + " WITH PASSWORD " + literal(pending)
        )
    conn.commit()
    conn.close()
    logger.info("setSecret: password updated for user %s", DB_USER)


def _test_secret(arn, token):
    pending = secrets_client.get_secret_value(
        SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
    )["SecretString"]

    conn = get_connection(pending)
    conn.close()
    logger.info("testSecret: connection verified with new password")


def _finish_secret(arn, token):
    metadata = secrets_client.describe_secret(SecretId=arn)
    current_version = None
    for version, stages in metadata["VersionIdsToStages"].items():
        if "AWSCURRENT" in stages:
            if version != token:
                current_version = version
            break

    secrets_client.update_secret_version_stage(
        SecretId=arn,
        VersionStage="AWSCURRENT",
        MoveToVersionId=token,
        RemoveFromVersionId=current_version,
    )
    logger.info("finishSecret: AWSCURRENT moved to version %s", token)