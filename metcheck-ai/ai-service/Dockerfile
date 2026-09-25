FROM python:3.11-slim

# Tesseract OCR binary + runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
# Ultralytics (torch) is heavy; YOLO is optional at runtime (YOLO_ENABLED=0 skips it).
# Install everything else first so a torch failure doesn't break the build is NOT needed —
# pip will install all; on low-RAM hosts set YOLO_ENABLED=0 at runtime to avoid loading it.
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV AI_PORT=8001 \
    YOLO_ENABLED=0 \
    PYTHONUNBUFFERED=1
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
