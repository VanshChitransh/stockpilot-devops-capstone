FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# deps first so this layer stays cached when only app code changes.
# pip itself is removed afterwards: it isn't needed at runtime and its vendored
# libs (urllib3, msgpack, setuptools) were the only HIGH findings in trivy
COPY requirements.txt .
RUN pip install -r requirements.txt \
    && pip uninstall -y pip \
    && useradd --create-home --uid 10001 appuser

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER 10001
EXPOSE 8000

# migrate, then exec so uvicorn becomes PID 1 and gets SIGTERM on pod shutdown
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
