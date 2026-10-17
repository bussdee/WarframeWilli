# WarframeWilli als Container (Familienmodus). Nur die Python-Standardbibliothek wird gebraucht.
# Das Image ist fuer amd64 und arm64 (Raspberry Pi) gebaut, die Basis python:3.12-slim gibt es fuer beide.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WFW_DATEN=/data \
    WFW_LAN=1 \
    TZ=Europe/Berlin

WORKDIR /app
COPY server.py wf_daten.py wf_profil.py LICENSE VERSION ./
COPY web ./web

EXPOSE 8765
USER 1000:1000
CMD ["python3", "server.py", "--lan", "--port", "8765"]
