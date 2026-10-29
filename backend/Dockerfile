FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fly.io's volume mount point for the SQLite database - see fly.toml.
# Overridden to this path only in production; local dev keeps the default
# (a file next to the source) from database.py.
ENV DATABASE_PATH=/data/oauth_launchpad.db

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
