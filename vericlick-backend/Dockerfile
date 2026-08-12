FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Vericlick_project/requirements.txt .
RUN pip install -r requirements.txt

COPY Vericlick_project/ .

EXPOSE 8000

CMD ["sh", "-c", \
    "python manage.py migrate --noinput && \
     python manage.py import_asn || true && \
     python manage.py collectstatic --noinput && \
     gunicorn Vericlick_project.wsgi:application --workers 3 --bind 0.0.0.0:8000"]
