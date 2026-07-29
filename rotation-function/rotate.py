import json
import logging
import secrets
import string

import boto3
import pg8000

logger = logging.getLogger()
logger.setLevel(logging.INFO)

secrets_client = boto3.client("secretsmanager")


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


def get_connection(secret):
    return pg8000.connect(
        host=secret["host"],
        port=secret.get("port", 5432),
        user=secret["username"],
        password=secret["password"],
        database=secret.get("dbname", "postgres"),
    )


def lambda_handler(event, context):
    arn = event["SecretId"]
    token = event["ClientRequestToken"]
    step = event["Step"]

    metadata = secrets_client.describe_secret(SecretId=arn)
    if not metadata["RotationEnabled"]:
        raise ValueError(f"Secret {arn} is not enabled for rotation")

    version_ids = metadata["VersionIdsToStages"]
    if token not in version_ids:
        raise ValueError(
            f"Rotation token {token} not found in secret {arn}"
        )

    if metadata["VersionIdToStages"].get(token, []) == ["AWSCURRENT"]:
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


def _create_secret(arn, token):
    try:
        secrets_client.get_secret_value(
            SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
        )
        logger.info("createSecret: AWSPENDING version %s already exists", token)
        return
    except secrets_client.exceptions.ResourceNotFoundException:
        pass

    current = json.loads(
        secrets_client.get_secret_value(
            SecretId=arn, VersionStage="AWSCURRENT"
        )["SecretString"]
    )

    current["password"] = generate_password()

    secrets_client.put_secret_value(
        SecretId=arn,
        ClientRequestToken=token,
        VersionStage="AWSPENDING",
        SecretString=json.dumps(current),
    )
    logger.info("createSecret: AWSPENDING version %s created", token)


def _set_secret(arn, token):
    pending = json.loads(
        secrets_client.get_secret_value(
            SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
        )["SecretString"]
    )

    conn = get_connection(pending)
    with conn.cursor() as cur:
        cur.execute(
            "ALTER USER " + pending["username"] + " WITH PASSWORD %s",
            (pending["password"],),
        )
    conn.commit()
    conn.close()
    logger.info("setSecret: password updated for user %s", pending["username"])


def _test_secret(arn, token):
    pending = json.loads(
        secrets_client.get_secret_value(
            SecretId=arn, VersionId=token, VersionStage="AWSPENDING"
        )["SecretString"]
    )

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