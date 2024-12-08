"""Web API entrypoint"""

# Import standard library
import io, os, datetime
import base64
import gc

# Import modules
from fastapi.responses import FileResponse
from fastapi import FastAPI, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import matplotlib
import matplotlib.pyplot as plt


matplotlib.use("Agg")
from matplotlib.backends.backend_agg import FigureCanvasAgg

# Import from package
from .sprites import generate_sprite
from .hashing import get_seeds, hasher

IMAGE_DIR = "/opt/generated_sprites"
if not os.path.exists(IMAGE_DIR):
    os.makedirs(IMAGE_DIR)

app = FastAPI(
    title="Sprite Generator",
    description="Generate 8-bit avatars from Cellular Automata!",
)

@app.get("/api/v1/image")
def make_sprite(filename: str = None):
    return FileResponse(f"{IMAGE_DIR}/{filename}.png", media_type="image/png")

@app.get("/api/v1/sprite")
def make_sprite(
    q: str = None,
    n_iters: int = 1,
    extinction: float = 0.125,
    survival: float = 0.375,
    size: int = 180,
):
    try:
        seeds = get_seeds(hasher(q)) if q else (None, None)
        sprite_seed, color_seeds = seeds

        logger.info("Generating sprite")
        fig = generate_sprite(
            n_iters=n_iters,
            extinction=extinction,
            survival=survival,
            size=size,
            sprite_seed=sprite_seed,
            color_seeds=color_seeds,
        )
    except Exception as e:
        logger.error(f"Error encountered: {e}")
        raise HTTPException(status_code=400, detail=str(e))


    logger.info("Saving the image to a folder")
    # Create a unique filename using the current timestamp
    image_filename = f"{IMAGE_DIR}/{q}.png"
    
    # Save the sprite image to the file system
    fig.savefig(image_filename)
    fig.set_size_inches(size / 100, size / 100)  # Adjust size as needed
    logger.info(f"Image saved as {image_filename}")
    
    return FileResponse(image_filename, media_type="image/png")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://0.0.0.0:8080", "http://frontend:3000", "http://localhost"],  # No wildcards here
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers, including Authorization
    expose_headers=["*"]
)
