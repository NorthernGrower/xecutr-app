#!/usr/bin/env python3
"""
The Xecutr media service: light Hugging Face models, CPU only.

There is no GPU on this box, so one job runs at a time and everything else
queues — that keeps the coding model responsive while an image or a clip is
being generated. Jobs are polled by id; the files they write outlive them.

  POST /api/media/jobs        {kind, prompt, steps?, size?, frames?, seed?} -> {id}
  GET  /api/media/jobs/<id>   -> {id, kind, status, progress, file?, error?, seconds}
  GET  /media/<name>          -> the bytes
  GET  /api/media/health      -> which models are configured and loaded

Environment:
  MEDIA_DATA         where generated files live      (default /data/media)
  MEDIA_IMAGE_MODEL  text-to-image model             (default stabilityai/sd-turbo)
  MEDIA_VIDEO_MODEL  animatediff | modelscope        (default animatediff)
  MEDIA_IDLE_UNLOAD  seconds idle before freeing RAM  (default 420)
  PORT               listen port                     (default 8090)
"""

import gc
import json
import os
import queue
import random
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

DATA = Path(os.environ.get("MEDIA_DATA", "/data/media"))
DATA.mkdir(parents=True, exist_ok=True)

IMAGE_MODEL = os.environ.get("MEDIA_IMAGE_MODEL", "stabilityai/sd-turbo")
VIDEO_MODEL = os.environ.get("MEDIA_VIDEO_MODEL", "animatediff")
IDLE_UNLOAD = int(os.environ.get("MEDIA_IDLE_UNLOAD", "420"))
PORT = int(os.environ.get("PORT", "8090"))

ANIMATEDIFF_BASE = os.environ.get("MEDIA_ANIMATEDIFF_BASE", "emilianJR/epiCRealism")
ANIMATEDIFF_ADAPTER = os.environ.get("MEDIA_ANIMATEDIFF_ADAPTER", "guoyww/animatediff-motion-adapter-v1-5-2")
ANIMATEDIFF_LORA = os.environ.get("MEDIA_ANIMATEDIFF_LORA", "ByteDance/AnimateDiff-Lightning")
ANIMATEDIFF_WEIGHTS = os.environ.get("MEDIA_ANIMATEDIFF_WEIGHTS", "animatediff_lightning_4step_diffusers.safetensors")
MODELSCOPE_MODEL = os.environ.get("MEDIA_MODELSCOPE_MODEL", "damo-vilab/text-to-video-ms-1.7b")

LIMITS = {
    "image": {"size": (256, 768), "steps": (1, 8)},
    "video": {"size": (256, 640), "steps": (1, 8), "frames": (8, 32)},
}

JOBS = {}
JOBS_LOCK = threading.Lock()
QUEUE = queue.Queue()
RUNNING = threading.Event()
LAST_USED = [time.time()]

PIPES = {"image": None, "video": None}

CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
}


def log(*parts):
    print("[media]", *parts, flush=True)


# --------------------------------------------------------------------------
# model loading — lazy, one kind at a time, freed again when idle
# --------------------------------------------------------------------------

def load_image():
    import torch
    from diffusers import AutoPipelineForText2Image

    log(f"loading image model {IMAGE_MODEL} (this pulls ~2.5 GB the first time)")
    pipe = AutoPipelineForText2Image.from_pretrained(
        IMAGE_MODEL,
        torch_dtype=torch.float32,
        safety_checker=None,
    )
    pipe.set_progress_bar_config(disable=True)
    log("image model ready")
    return pipe


def load_video():
    import torch

    if VIDEO_MODEL == "modelscope":
        from diffusers import TextToVideoSDPipeline

        log(f"loading video model {MODELSCOPE_MODEL}")
        pipe = TextToVideoSDPipeline.from_pretrained(MODELSCOPE_MODEL, torch_dtype=torch.float32)
        # ModelScope's pipeline defaults to 226 tokens, which this tokenizer clips.
        pipe.text_encoder.config.max_length = 226
    else:
        from diffusers import AnimateDiffPipeline, EulerDiscreteScheduler, MotionAdapter
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file

        log(f"loading AnimateDiff-Lightning {ANIMATEDIFF_WEIGHTS} on {ANIMATEDIFF_BASE}")
        # AnimateDiff-Lightning checkpoints are complete motion modules (keys like
        # down_blocks.*.motion_modules.*), NOT LoRAs — pipe.load_lora_weights rejects
        # them with "Invalid LoRA checkpoint". ByteDance's official usage: load the
        # safetensors into a fresh MotionAdapter with load_state_dict.
        adapter = MotionAdapter()
        adapter.load_state_dict(load_file(hf_hub_download(ANIMATEDIFF_LORA, ANIMATEDIFF_WEIGHTS)))
        pipe = AnimateDiffPipeline.from_pretrained(
            ANIMATEDIFF_BASE,
            motion_adapter=adapter,
            torch_dtype=torch.float32,
        )
        pipe.scheduler = EulerDiscreteScheduler.from_config(
            pipe.scheduler.config,
            beta_schedule="linear",
            beta_start=0.00085,
            timestep_spacing="trailing",
        )
        pipe.enable_vae_slicing()

    pipe.set_progress_bar_config(disable=True)
    log("video model ready")
    return pipe


def pipe_for(kind):
    """Load on demand, and hold only one kind of model in RAM at a time."""
    other = "video" if kind == "image" else "image"
    if PIPES[other] is not None:
        PIPES[other] = None
        gc.collect()
    if PIPES[kind] is None:
        PIPES[kind] = load_image() if kind == "image" else load_video()
    LAST_USED[0] = time.time()
    return PIPES[kind]


def idle_collector():
    """Give the RAM back to Ollama when nothing has been generated for a while."""
    while True:
        time.sleep(60)
        if RUNNING.is_set() or QUEUE.qsize():
            continue
        if time.time() - LAST_USED[0] < IDLE_UNLOAD:
            continue
        if PIPES["image"] is None and PIPES["video"] is None:
            continue
        PIPES["image"] = None
        PIPES["video"] = None
        gc.collect()
        log("idle — models unloaded, RAM returned")


# --------------------------------------------------------------------------
# generation
# --------------------------------------------------------------------------

def ticker(job, steps, span=(0.15, 0.95)):
    """A progress callback that also keeps /jobs honest across diffusers versions."""
    start, end = span

    def tick(_pipe, index, _timestep, callback_kwargs):
        job["progress"] = round(start + (end - start) * (index + 1) / max(1, steps), 3)
        return callback_kwargs

    return tick


def run_image(job):
    import torch

    pipe = pipe_for("image")
    steps = int(job["params"].get("steps") or 2)
    size = int(job["params"].get("size") or 512)
    seed = int(job["params"].get("seed") if job["params"].get("seed") is not None else random.randrange(1, 2**31))
    job["seed"] = seed

    generator = torch.Generator("cpu").manual_seed(seed)
    result = pipe(
        prompt=job["prompt"],
        num_inference_steps=steps,
        guidance_scale=0.0,  # turbo models are distilled for unconditional guidance
        width=size,
        height=size,
        generator=generator,
        callback_on_step_end=ticker(job, steps),
    )

    job["progress"] = 0.97
    name = f"{job['id']}.jpg"
    result.images[0].save(DATA / name, format="JPEG", quality=88)
    job["file"] = name


def run_video(job):
    import torch
    from diffusers.utils import export_to_video

    pipe = pipe_for("video")
    steps = int(job["params"].get("steps") or 4)
    size = int(job["params"].get("size") or 512)
    frames = int(job["params"].get("frames") or 16)
    fps = int(job["params"].get("fps") or 8)
    seed = int(job["params"].get("seed") if job["params"].get("seed") is not None else random.randrange(1, 2**31))
    job["seed"] = seed

    generator = torch.Generator("cpu").manual_seed(seed)
    result = pipe(
        prompt=job["prompt"],
        num_frames=frames,
        num_inference_steps=steps,
        guidance_scale=1.0,  # Lightning checkpoints run without classifier-free guidance
        width=size,
        height=size,
        generator=generator,
        callback_on_step_end=ticker(job, steps),
    )

    job["progress"] = 0.97
    name = f"{job['id']}.mp4"
    export_to_video(result.frames[0], str(DATA / name), fps=fps)
    job["file"] = name


def worker():
    while True:
        job = QUEUE.get()
        if job is None:
            return
        RUNNING.set()
        started = time.time()
        job["status"] = "running"
        job["progress"] = 0.05
        log(f"{job['kind']} job {job['id']} started")
        try:
            if job["kind"] == "image":
                run_image(job)
            else:
                run_video(job)
            job["status"] = "done"
            job["progress"] = 1.0
            log(f"{job['kind']} job {job['id']} done in {time.time() - started:.1f}s")
        except Exception as err:  # noqa: BLE001 — a failed job must never kill the worker
            job["status"] = "error"
            job["error"] = f"{type(err).__name__}: {err}"
            log(f"{job['kind']} job {job['id']} failed: {job['error']}")
            traceback.print_exc()
        finally:
            job["seconds"] = round(time.time() - started, 1)
            LAST_USED[0] = time.time()
            RUNNING.clear()
            QUEUE.task_done()


# --------------------------------------------------------------------------
# request handling
# --------------------------------------------------------------------------

def sanitise(body):
    kind = body.get("kind")
    if kind not in ("image", "video"):
        raise ValueError("kind must be 'image' or 'video'")

    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    if len(prompt) > 1200:
        raise ValueError("prompt is too long (1200 characters max)")

    limits = LIMITS[kind]
    params = {}

    def bounded(key, default, low, high):
        try:
            value = int(body.get(key)) if body.get(key) not in (None, "") else default
        except (TypeError, ValueError):
            value = default
        return max(low, min(high, value))

    size_low, size_high = limits["size"]
    params["size"] = bounded("size", 512, size_low, size_high)

    step_low, step_high = limits["steps"]
    params["steps"] = bounded("steps", 2 if kind == "image" else 4, step_low, step_high)

    if kind == "video":
        frame_low, frame_high = limits["frames"]
        params["frames"] = bounded("frames", 16, frame_low, frame_high)
        params["fps"] = bounded("fps", 8, 4, 16)
    else:
        params.pop("frames", None)

    if body.get("seed") not in (None, ""):
        params["seed"] = bounded("seed", 0, 0, 2**31 - 1)

    return {"kind": kind, "prompt": prompt, "params": params}


def public_job(job):
    return {
        "id": job["id"],
        "kind": job["kind"],
        "status": job["status"],
        "progress": job.get("progress", 0.0),
        "file": job.get("file"),
        "error": job.get("error"),
        "seconds": job.get("seconds"),
        "seed": job.get("seed"),
        "prompt": job["prompt"],
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # noqa: A003 — quieter access log
        if "/health" not in (args[0] if args else ""):
            log(f"{self.address_string()} {fmt % args}")

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, path):
        name = Path(path).name
        file = DATA / name
        if not file.is_file():
            return self._json(404, {"error": "no such file"})
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(file.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"

        if path == "/api/media/health":
            return self._json(
                200,
                {
                    "ok": True,
                    "device": "cpu",
                    "image_model": IMAGE_MODEL,
                    "video_model": VIDEO_MODEL if VIDEO_MODEL == "modelscope" else f"AnimateDiff-Lightning/{ANIMATEDIFF_BASE}",
                    "loaded": [k for k, v in PIPES.items() if v is not None],
                    "busy": RUNNING.is_set(),
                    "queued": QUEUE.qsize(),
                },
            )

        if path.startswith("/api/media/jobs/"):
            job_id = path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            if not job:
                return self._json(404, {"error": "no such job"})
            return self._json(200, public_job(job))

        if path.startswith("/media/"):
            return self._bytes(path)

        return self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")

        if path != "/api/media/jobs":
            return self._json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            job = sanitise(json.loads(raw.decode("utf-8") or "{}"))
        except (ValueError, json.JSONDecodeError) as err:
            return self._json(400, {"error": str(err)})

        job.update({"id": uuid.uuid4().hex[:12], "status": "queued", "progress": 0.0})
        with JOBS_LOCK:
            JOBS[job["id"]] = job
        QUEUE.put(job)
        log(f"{job['kind']} job {job['id']} queued ({job['prompt'][:60]!r})")
        return self._json(202, public_job(job))


def main():
    threading.Thread(target=worker, daemon=True).start()
    threading.Thread(target=idle_collector, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log(
        f"listening on 127.0.0.1:{PORT} — image {IMAGE_MODEL}, "
        f"video {VIDEO_MODEL}, files in {DATA}"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
