# The Xecutr media service: light Hugging Face models on CPU.
# Built from this repo; the gateway reaches it on the host loopback.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/data/hf \
    HF_HUB_ENABLE_HF_TRANSFER=0 \
    MEDIA_DATA=/data/media

WORKDIR /app

# ffmpeg from the CPU wheel image is not included — imageio-ffmpeg ships its own
# binary, so only the shared libraries Pillow and torch expect are needed here.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY deploy/media/requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0 \
    && pip install -r requirements.txt

COPY deploy/media/server.py .

VOLUME ["/data"]
EXPOSE 8090
CMD ["python3", "server.py"]
